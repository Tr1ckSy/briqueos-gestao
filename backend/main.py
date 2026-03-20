from fastapi import FastAPI, HTTPException, Depends, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from sqlalchemy.orm import Session
from contextlib import asynccontextmanager
from typing import List, Optional
from datetime import date, timedelta
import json, asyncio, secrets, threading, os, uuid, base64, models, schemas, crud, admin_crud, admin_schemas
from database import engine, get_db
from auth import criar_token, get_usuario_atual, verificar_senha, hash_senha
from logger import registrar
from payer import (
    criar_cobranca, consultar_status, processar_webhook_payer,
    verificar_limite_compras, verificar_funcionalidade,
    get_plano_info, PRECOS, _plano_ativo,
)
from email_service import (
    email_boas_vindas, email_plano_ativado, email_plano_expirando,
    email_sub_usuario_convidado,
    email_reset_senha,
)
from scheduler import run_scheduler

UPLOAD_DIR = "uploads/fotos"

models.Base.metadata.create_all(bind=engine)


def run_async(coro):
    def _run():
        asyncio.run(coro)
    threading.Thread(target=_run, daemon=True).start()


@asynccontextmanager
async def lifespan(app):
    # Garante diretório de uploads e monta rota estática
    os.makedirs(UPLOAD_DIR, exist_ok=True)
    try:
        app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")
    except Exception:
        pass  # já montado em reloads do uvicorn
    task = asyncio.create_task(run_scheduler())
    yield
    task.cancel()


limiter = Limiter(key_func=get_remote_address)
app = FastAPI(title="BriqueOS API", version="3.2.0", lifespan=lifespan)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


def _salvar_foto(base64_data, prefixo: str = "foto"):
    """Salva base64 em disco e retorna o caminho relativo. Retorna None se não for base64."""
    if not base64_data or not base64_data.startswith("data:image"):
        return base64_data  # já é URL ou None, não precisa salvar
    try:
        header, data = base64_data.split(",", 1)
        ext = "jpg"
        if "png" in header:
            ext = "png"
        elif "webp" in header:
            ext = "webp"
        nome = f"{prefixo}_{uuid.uuid4().hex[:12]}.{ext}"
        caminho = os.path.join(UPLOAD_DIR, nome)
        with open(caminho, "wb") as f:
            f.write(base64.b64decode(data))
        return f"/uploads/fotos/{nome}"
    except Exception:
        return None  # se falhar, ignora silenciosamente


def get_admin_user(usuario=Depends(get_usuario_atual)):
    admin_crud.require_admin(usuario)
    return usuario


# ─── AUTH ─────────────────────────────────────────────────────────────

@app.post("/auth/cadastro", response_model=schemas.TokenResposta, status_code=201)
@limiter.limit("10/minute")
def cadastrar(request: Request, dados: schemas.UsuarioCreate, db: Session = Depends(get_db)):
    if crud.get_usuario_por_email(db, dados.email):
        raise HTTPException(status_code=400, detail="E-mail já cadastrado")
    usuario = crud.criar_usuario(db, dados)
    token   = criar_token(usuario.id, usuario.email)
    registrar(db, "cadastro", request, usuario_id=usuario.id, email=usuario.email)
    run_async(email_boas_vindas(usuario.email, usuario.nome))
    return {"access_token": token, "token_type": "bearer", "usuario": usuario}


@app.post("/auth/login", response_model=schemas.TokenResposta)
@limiter.limit("20/minute")
def login(request: Request, dados: schemas.UsuarioLogin, db: Session = Depends(get_db)):
    usuario = crud.autenticar_usuario(db, dados.email, dados.senha)
    if not usuario:
        registrar(db, "erro_login", request, email=dados.email, sucesso=False,
                  detalhe={"motivo": "Credenciais incorretas"})
        raise HTTPException(status_code=401, detail="E-mail ou senha incorretos")
    if not usuario.ativo:
        raise HTTPException(status_code=403, detail="Conta desativada.")
    token = criar_token(usuario.id, usuario.email)
    registrar(db, "login", request, usuario_id=usuario.id, email=usuario.email)
    return {"access_token": token, "token_type": "bearer", "usuario": usuario}


@app.post("/auth/logout")
def logout(request: Request, db: Session = Depends(get_db), usuario=Depends(get_usuario_atual)):
    registrar(db, "logout", request, usuario_id=usuario.id, email=usuario.email)
    return {"ok": True}


@app.get("/auth/me", response_model=schemas.UsuarioPublico)
def me(usuario=Depends(get_usuario_atual)):
    return usuario


@app.put("/auth/me/nome", response_model=schemas.UsuarioPublico)
def atualizar_nome(dados: schemas.AtualizarNome, db: Session = Depends(get_db), usuario=Depends(get_usuario_atual)):
    usuario.nome = dados.nome
    db.commit(); db.refresh(usuario); return usuario


@app.put("/auth/me/senha", response_model=schemas.UsuarioPublico)
def atualizar_senha(dados: schemas.AtualizarSenha, db: Session = Depends(get_db), usuario=Depends(get_usuario_atual)):
    if not verificar_senha(dados.senha_atual, usuario.senha_hash):
        raise HTTPException(status_code=400, detail="Senha atual incorreta")
    if dados.senha_atual == dados.nova_senha:
        raise HTTPException(status_code=400, detail="Nova senha deve ser diferente")
    usuario.senha_hash = hash_senha(dados.nova_senha)
    db.commit(); db.refresh(usuario); return usuario


@app.put("/auth/me/foto", response_model=schemas.UsuarioPublico)
def atualizar_foto(dados: schemas.AtualizarFoto, db: Session = Depends(get_db),
                   usuario=Depends(get_usuario_atual)):
    usuario.foto_url = _salvar_foto(dados.foto_url, f"avatar_{usuario.id}")
    db.commit(); db.refresh(usuario); return usuario


@app.get("/auth/me/conquistas")
def get_conquistas(db: Session = Depends(get_db), usuario=Depends(get_usuario_atual)):
    """Retorna e atualiza automaticamente o status de conquistas do usuário."""
    vendas = (
        db.query(models.Venda, models.Compra.custo_total)
        .select_from(models.Venda)
        .join(models.Compra, models.Venda.compra_id == models.Compra.id)
        .filter(models.Compra.usuario_id == usuario.id)
        .all()
    )
    lucro_total = sum(v.preco_venda - (custo or 0) for v, custo in vendas)

    atualizado = False
    if lucro_total >= 10000 and not usuario.conquista_10k:
        usuario.conquista_10k = True
        atualizado = True
    if lucro_total >= 50000 and not usuario.conquista_50k:
        usuario.conquista_50k = True
        atualizado = True
    if atualizado:
        db.commit()

    return {
        "conquista_10k": usuario.conquista_10k,
        "conquista_50k": usuario.conquista_50k,
        "lucro_total":   round(lucro_total, 2),
    }


# ─── RECUPERAÇÃO DE SENHA ─────────────────────────────────────────────

@app.post("/auth/forgot-password")
@limiter.limit("5/minute")
def forgot_password(request: Request, dados: schemas.ForgotPassword,
                    db: Session = Depends(get_db)):
    usuario = crud.get_usuario_por_email(db, dados.email)
    if usuario and usuario.ativo:
        token = crud.criar_reset_token(db, usuario.id)
        run_async(email_reset_senha(usuario.email, usuario.nome, token))
    return {"ok": True, "message": "Se o e-mail existir, você receberá o link em instantes."}


@app.post("/auth/reset-password")
@limiter.limit("10/minute")
def reset_password(request: Request, dados: schemas.ResetPassword,
                   db: Session = Depends(get_db)):
    sucesso = crud.usar_reset_token(db, dados.token, dados.nova_senha)
    if not sucesso:
        raise HTTPException(status_code=400,
                            detail="Token inválido ou expirado. Solicite um novo link.")
    return {"ok": True, "message": "Senha redefinida com sucesso!"}


# ─── COMPRAS ──────────────────────────────────────────────────────────

@app.get("/compras", response_model=List[schemas.Compra])
def listar_compras(db: Session = Depends(get_db), usuario=Depends(get_usuario_atual)):
    return crud.get_compras(db, usuario.id, usuario)


@app.post("/compras", response_model=schemas.Compra, status_code=201)
def criar_compra(request: Request, compra: schemas.CompraCreate,
                 db: Session = Depends(get_db), usuario=Depends(get_usuario_atual)):
    verificar_limite_compras(db, usuario)
    if usuario.plano == "gratis" and compra.foto_url:
        compra = compra.copy(update={"foto_url": None})
    elif compra.foto_url:
        compra = compra.copy(update={"foto_url": _salvar_foto(compra.foto_url, "compra")})
    c = crud.create_compra(db, compra, usuario.id)
    registrar(db, "compra", request, usuario_id=usuario.id,
              detalhe={"titulo": compra.titulo, "custo": compra.preco_compra})
    return c


@app.put("/compras/{compra_id}", response_model=schemas.Compra)
def atualizar_compra(compra_id: int, dados: schemas.CompraCreate,
                     db: Session = Depends(get_db), usuario=Depends(get_usuario_atual)):
    if usuario.plano == "gratis" and dados.foto_url:
        dados = dados.copy(update={"foto_url": None})
    elif dados.foto_url:
        dados = dados.copy(update={"foto_url": _salvar_foto(dados.foto_url, "compra")})
    compra = crud.update_compra(db, compra_id, dados, usuario.id, usuario)
    if not compra:
        raise HTTPException(status_code=404, detail="Compra não encontrada")
    return compra


@app.delete("/compras/{compra_id}", status_code=204)
def deletar_compra(request: Request, compra_id: int,
                   db: Session = Depends(get_db), usuario=Depends(get_usuario_atual)):
    try:
        ok = crud.delete_compra(db, compra_id, usuario.id, usuario)
        if not ok:
            raise HTTPException(status_code=404, detail="Compra não encontrada")
        registrar(db, "delete_compra", request, usuario_id=usuario.id,
                  detalhe={"compra_id": compra_id})
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao deletar compra: {str(e)}")


# ─── VENDAS ───────────────────────────────────────────────────────────

@app.get("/vendas", response_model=List[schemas.Venda])
def listar_vendas(db: Session = Depends(get_db), usuario=Depends(get_usuario_atual)):
    return crud.get_vendas(db, usuario.id, usuario)


@app.post("/vendas", response_model=schemas.Venda, status_code=201)
def criar_venda(request: Request, venda: schemas.VendaCreate,
                db: Session = Depends(get_db), usuario=Depends(get_usuario_atual)):
    compra = crud.get_compra(db, venda.compra_id, usuario.id, usuario)
    if not compra:
        raise HTTPException(status_code=404, detail="Compra não encontrada")
    if crud.item_foi_vendido(db, venda.compra_id):
        raise HTTPException(status_code=400, detail="Este item já foi vendido")
    v = crud.create_venda(db, venda)
    registrar(db, "venda", request, usuario_id=usuario.id,
              detalhe={"compra_id": venda.compra_id, "preco": venda.preco_venda})
    return v


@app.delete("/vendas/{venda_id}", status_code=204)
def deletar_venda(venda_id: int, db: Session = Depends(get_db), usuario=Depends(get_usuario_atual)):
    try:
        ok = crud.delete_venda(db, venda_id, usuario.id, usuario)
        if not ok:
            raise HTTPException(status_code=404, detail="Venda não encontrada")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao deletar venda: {str(e)}")


@app.put("/vendas/{venda_id}", response_model=schemas.Venda)
def atualizar_venda(venda_id: int, dados: schemas.VendaUpdate,
                    db: Session = Depends(get_db), usuario=Depends(get_usuario_atual)):
    venda = crud.update_venda(db, venda_id, dados, usuario.id, usuario)
    if not venda:
        raise HTTPException(status_code=404, detail="Venda não encontrada")
    return venda


# ─── DASHBOARD & PLANO ────────────────────────────────────────────────

@app.get("/dashboard")
def resumo_dashboard(db: Session = Depends(get_db), usuario=Depends(get_usuario_atual)):
    return crud.get_dashboard(db, usuario.id, usuario)


@app.get("/meu-plano")
def meu_plano(db: Session = Depends(get_db), usuario=Depends(get_usuario_atual)):
    info  = get_plano_info(usuario)
    total = db.query(models.Compra).filter(models.Compra.usuario_id == usuario.id).count()
    info["compras_usadas"] = total
    info["compras_limite"] = info["limites"]["compras"]
    return info


# ─── PAYER PIX ────────────────────────────────────────────────────────

@app.post("/pagamento/pix")
async def criar_pix(request: Request, db: Session = Depends(get_db),
                    usuario=Depends(get_usuario_atual)):
    body  = await request.json()
    cpf   = body.get("cpf", "")
    nome  = body.get("nome") or usuario.nome
    plano = body.get("plano", "pro")
    tipo  = body.get("tipo", "mensal")
    if plano not in ("pro", "business"):
        raise HTTPException(status_code=400, detail="Plano inválido")
    host     = str(request.base_url).rstrip("/")
    callback = f"{host}/webhook/payer"
    data = await criar_cobranca(
        nome=nome, email=usuario.email, cpf=cpf,
        plano=plano, tipo=tipo, callback_url=callback
    )
    return data


@app.get("/pagamento/pix/status")
async def status_pix(id: str, plano: str = "pro", tipo: str = "mensal",
                     db: Session = Depends(get_db), usuario=Depends(get_usuario_atual)):
    data = await consultar_status(id)
    st   = (data.get("status") or "").upper()
    if st == "COMPLETED" and usuario.plano != plano:
        dias   = 365 if tipo == "anual" else 30
        expira = (date.today() + timedelta(days=dias)).isoformat()
        usuario.plano        = plano
        usuario.plano_expira = expira
        db.commit()
        asyncio.create_task(email_plano_ativado(usuario.email, usuario.nome, plano, expira))
    return {"status": st, "plano": usuario.plano}


@app.post("/webhook/payer")
async def webhook_payer(request: Request, db: Session = Depends(get_db)):
    try:
        payload = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="JSON inválido")
    resultado = processar_webhook_payer(db, payload)
    return {"ok": True, **resultado}


# ─── ADMIN ────────────────────────────────────────────────────────────

@app.get("/admin/stats")
def admin_stats(db: Session = Depends(get_db), u=Depends(get_admin_user)):
    return admin_crud.get_stats(db)


@app.get("/admin/users")
def admin_list_users(db: Session = Depends(get_db), u=Depends(get_admin_user)):
    return admin_crud.get_all_users(db)


@app.post("/admin/users", status_code=201)
def admin_create_user(dados: admin_schemas.AdminCreateUser,
                      db: Session = Depends(get_db), u=Depends(get_admin_user)):
    if crud.get_usuario_por_email(db, dados.email):
        raise HTTPException(status_code=400, detail="E-mail já cadastrado")
    return admin_crud.admin_create_user(db, dados)


@app.put("/admin/users/{user_id}")
def admin_update_user(user_id: int, dados: admin_schemas.AdminUpdateUser,
                      db: Session = Depends(get_db), u=Depends(get_admin_user)):
    user = admin_crud.admin_update_user(db, user_id, dados)
    if not user:
        raise HTTPException(status_code=404, detail="Usuário não encontrado")
    return {"ok": True, "id": user.id, "nome": user.nome}


@app.put("/admin/users/{user_id}/toggle-status")
def admin_toggle_status(user_id: int, db: Session = Depends(get_db), u=Depends(get_admin_user)):
    user = admin_crud.toggle_user_status(db, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="Usuário não encontrado")
    return {"ok": True, "ativo": user.ativo}


@app.put("/admin/users/{user_id}/toggle-admin")
def admin_toggle_admin(user_id: int, db: Session = Depends(get_db), usuario=Depends(get_admin_user)):
    if user_id == usuario.id:
        raise HTTPException(status_code=400, detail="Não pode alterar seu próprio papel")
    user = admin_crud.toggle_admin_status(db, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="Usuário não encontrado")
    return {"ok": True, "is_admin": user.is_admin}


@app.delete("/admin/users/{user_id}", status_code=204)
def admin_delete_user(user_id: int, db: Session = Depends(get_db), usuario=Depends(get_admin_user)):
    if user_id == usuario.id:
        raise HTTPException(status_code=400, detail="Não pode excluir sua própria conta")
    if not admin_crud.admin_delete_user(db, user_id):
        raise HTTPException(status_code=404, detail="Usuário não encontrado")


@app.get("/admin/logs")
def admin_logs(db: Session = Depends(get_db), u=Depends(get_admin_user)):
    return admin_crud.get_logs(db)


@app.get("/admin/anomalias")
def admin_anomalias(db: Session = Depends(get_db), u=Depends(get_admin_user)):
    return admin_crud.get_anomalias(db)


@app.get("/admin/retencao")
def admin_retencao(db: Session = Depends(get_db), u=Depends(get_admin_user)):
    return admin_crud.get_retencao(db)


@app.get("/admin/system-info")
def admin_system_info(db: Session = Depends(get_db), u=Depends(get_admin_user)):
    return admin_crud.get_system_info(db)


@app.get("/admin/planos/stats")
def admin_plano_stats(db: Session = Depends(get_db), u=Depends(get_admin_user)):
    return admin_crud.get_plano_stats(db)


@app.put("/admin/users/{user_id}/plano")
def admin_set_plano(user_id: int, dados: dict,
                    db: Session = Depends(get_db), u=Depends(get_admin_user)):
    plano  = dados.get("plano", "gratis")
    expira = dados.get("expira", None)
    if plano not in ("gratis", "pro", "business"):
        raise HTTPException(status_code=400, detail="Plano inválido")
    user = admin_crud.set_plano_usuario(db, user_id, plano, expira)
    if not user:
        raise HTTPException(status_code=404, detail="Usuário não encontrado")
    return {"ok": True, "plano": user.plano, "expira": user.plano_expira}


# ─── DEBUG PIX (remova em produção) ───────────────────────────────────

@app.post("/debug/pix-raw")
async def debug_pix_raw(request: Request, u=Depends(get_admin_user)):
    import httpx
    from payer import PAYER_TOKEN, PAYER_BASE, PAYER_HEADERS
    body = await request.json()
    cpf  = "".join(d for d in body.get("cpf","00000000000") if d.isdigit()) or "00000000000"
    payload = {
        "amount": 1, "generatedName": body.get("nome","Teste"),
        "generatedEmail": body.get("email","teste@briqueOS.com"),
        "generatedDocument": cpf, "callbackUrl": "https://example.com/webhook", "expiresIn": 120,
    }
    async with httpx.AsyncClient(timeout=20) as client:
        r = await client.post(f"{PAYER_BASE}/pix", json=payload, headers=PAYER_HEADERS)
    return {
        "status_code": r.status_code, "headers": dict(r.headers), "body": r.text,
        "json": r.json() if "application/json" in r.headers.get("content-type","") else None,
    }


# ─── MULTI-USUÁRIO BUSINESS ───────────────────────────────────────────

def _verificar_dono_business(usuario: models.Usuario):
    # Usa _plano_ativo para detectar plano expirado corretamente
    if _plano_ativo(usuario) != "business":
        raise HTTPException(status_code=402, detail="Disponível apenas no plano Business")
    if usuario.conta_pai_id is not None:
        raise HTTPException(status_code=403, detail="Apenas o dono da conta pode gerenciar a equipe")


@app.get("/equipe")
def listar_equipe(db: Session = Depends(get_db), usuario=Depends(get_usuario_atual)):
    if _plano_ativo(usuario) != "business":
        raise HTTPException(status_code=402, detail="Disponível apenas no plano Business")
    pai_id = usuario.conta_pai_id if usuario.conta_pai_id else usuario.id
    membros = db.query(models.Usuario).filter(
        models.Usuario.conta_pai_id == pai_id
    ).all()
    return [{"id": m.id, "nome": m.nome, "email": m.email, "ativo": m.ativo} for m in membros]


@app.post("/equipe/convidar", status_code=201)
async def convidar_membro(request: Request, db: Session = Depends(get_db),
                          usuario=Depends(get_usuario_atual)):
    _verificar_dono_business(usuario)
    membros = db.query(models.Usuario).filter(
        models.Usuario.conta_pai_id == usuario.id
    ).count()
    if membros >= 4:
        raise HTTPException(status_code=400, detail="Limite de 5 usuários atingido (4 convidados + dono)")
    body  = await request.json()
    email = body.get("email", "").lower().strip()
    nome  = body.get("nome", "Membro da Equipe")
    if not email or "@" not in email:
        raise HTTPException(status_code=400, detail="Email inválido")
    if crud.get_usuario_por_email(db, email):
        raise HTTPException(status_code=400, detail="Este email já possui uma conta")
    senha_temp = secrets.token_urlsafe(8)
    from auth import hash_senha as hs
    novo = models.Usuario(
        nome=nome, email=email,
        senha_hash=hs(senha_temp),
        plano="business",
        plano_expira=usuario.plano_expira,
        conta_pai_id=usuario.id,
    )
    db.add(novo); db.commit(); db.refresh(novo)
    asyncio.create_task(email_sub_usuario_convidado(email, usuario.nome, senha_temp))
    return {"ok": True, "id": novo.id, "email": email}


@app.delete("/equipe/{membro_id}", status_code=204)
def remover_membro(membro_id: int, db: Session = Depends(get_db),
                   usuario=Depends(get_usuario_atual)):
    _verificar_dono_business(usuario)
    membro = db.query(models.Usuario).filter(
        models.Usuario.id == membro_id,
        models.Usuario.conta_pai_id == usuario.id
    ).first()
    if not membro:
        raise HTTPException(status_code=404, detail="Membro não encontrado")
    db.delete(membro); db.commit()


# ─── PUSH NOTIFICATIONS ──────────────────────────────────────────────

@app.post("/push/subscribe")
async def push_subscribe(request: Request, db: Session = Depends(get_db),
                         usuario=Depends(get_usuario_atual)):
    body = await request.json()
    usuario.push_subscription = json.dumps(body)
    db.commit()
    return {"ok": True}


@app.delete("/push/unsubscribe")
def push_unsubscribe(db: Session = Depends(get_db), usuario=Depends(get_usuario_atual)):
    usuario.push_subscription = None
    db.commit()
    return {"ok": True}