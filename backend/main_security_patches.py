"""
BriqueOS — main.py (trechos corrigidos)

Correções aplicadas:
  1. CORS restrito para origens configuradas
  2. Debug endpoints protegidos por flag de ambiente
  3. Webhook com verificação de origem/IP
  4. Middleware de segurança adicionado
  5. payer.py agora recebe db para persistir expirações
"""
from fastapi import FastAPI, HTTPException, Depends, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.responses import JSONResponse
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from sqlalchemy.orm import Session
from contextlib import asynccontextmanager
import json, asyncio, secrets, threading, models, schemas, crud, admin_crud, admin_schemas
from database import engine, get_db
from auth import criar_token, get_usuario_atual, verificar_senha, hash_senha
from logger import registrar
from config import settings
from payer import (
    criar_cobranca, consultar_status, processar_webhook_payer,
    verificar_limite_compras, verificar_funcionalidade,
    get_plano_info, PRECOS
)
from email_service import (
    email_boas_vindas, email_plano_ativado, email_conquista_placa,
    email_nova_placa_endereco, email_sub_usuario_convidado
)
from scheduler import run_scheduler, job_verificar_conquistas

models.Base.metadata.create_all(bind=engine)


def run_async(coro):
    def _run():
        asyncio.run(coro)
    threading.Thread(target=_run, daemon=True).start()


@asynccontextmanager
async def lifespan(app):
    task = asyncio.create_task(run_scheduler())
    yield
    task.cancel()


limiter = Limiter(key_func=get_remote_address)
app = FastAPI(
    title="BriqueOS API",
    version="3.1.0",
    lifespan=lifespan,
    # Esconder docs em produção
    docs_url="/docs" if not settings.IS_PRODUCTION else None,
    redoc_url="/redoc" if not settings.IS_PRODUCTION else None,
)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# ── CORREÇÃO 1: CORS restrito ──────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,  # Não mais ["*"]
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["Authorization", "Content-Type"],
)

# ── CORREÇÃO 2: Headers de segurança ──────────────────────────────────
@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    if settings.IS_PRODUCTION:
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    return response


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


# ─── COMPRAS ──────────────────────────────────────────────────────────

@app.post("/compras", response_model=schemas.Compra, status_code=201)
def criar_compra(request: Request, compra: schemas.CompraCreate,
                 db: Session = Depends(get_db), usuario=Depends(get_usuario_atual)):
    verificar_limite_compras(db, usuario)  # CORREÇÃO: passa db para persistir expiração
    if usuario.plano == "gratis" and compra.foto_url:
        compra = compra.copy(update={"foto_url": None})
    c = crud.create_compra(db, compra, usuario.id)
    registrar(db, "compra", request, usuario_id=usuario.id,
              detalhe={"titulo": compra.titulo, "custo": compra.preco_compra})
    return c


# ─── DASHBOARD & PLANO ────────────────────────────────────────────────

@app.get("/meu-plano")
def meu_plano(db: Session = Depends(get_db), usuario=Depends(get_usuario_atual)):
    info  = get_plano_info(db, usuario)  # CORREÇÃO: passa db
    total = db.query(models.Compra).filter(
        models.Compra.usuario_id == usuario.id
    ).count()
    info["compras_usadas"] = total
    info["compras_limite"] = info["limites"]["compras"]
    return info


# ─── WEBHOOK PAYER ────────────────────────────────────────────────────

# IPs da Payer que podem chamar o webhook (configure conforme documentação deles)
PAYER_ALLOWED_IPS = set(
    (settings.PAYER_ALLOWED_IPS or "").split(",")
) if hasattr(settings, 'PAYER_ALLOWED_IPS') else set()

@app.post("/webhook/payer")
async def webhook_payer(request: Request, db: Session = Depends(get_db)):
    # Verificação de IP de origem (opcional, mas recomendado)
    if PAYER_ALLOWED_IPS:
        client_ip = request.client.host
        if client_ip not in PAYER_ALLOWED_IPS:
            raise HTTPException(status_code=403, detail="IP não autorizado para webhook")

    try:
        payload = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="JSON inválido")

    resultado = processar_webhook_payer(db, payload)
    return {"ok": True, **resultado}


# ─── PERFIL ───────────────────────────────────────────────────────────

@app.put("/auth/me/foto", response_model=schemas.UsuarioPublico)
def atualizar_foto(dados: schemas.AtualizarFoto, db: Session = Depends(get_db),
                   usuario=Depends(get_usuario_atual)):
    verificar_funcionalidade(db, usuario, "foto")  # CORREÇÃO: passa db
    usuario.foto_url = dados.foto_url
    db.commit()
    db.refresh(usuario)
    return usuario


# ─── DEBUG ENDPOINTS (apenas em desenvolvimento) ──────────────────────
# CORREÇÃO: estes endpoints NÃO existem em produção

if not settings.IS_PRODUCTION:
    @app.post("/debug/pix-raw")
    async def debug_pix_raw(request: Request, u=Depends(get_admin_user)):
        """Admin only: testa conexão com a Payer."""
        import httpx
        body = await request.json()
        cpf  = "".join(d for d in body.get("cpf", "00000000000") if d.isdigit()) or "00000000000"
        payload = {
            "amount":            1,
            "generatedName":     body.get("nome", "Teste"),
            "generatedEmail":    body.get("email", "teste@briqueOS.com"),
            "generatedDocument": cpf,
            "callbackUrl":       "https://example.com/webhook",
            "expiresIn":         120,
        }
        async with httpx.AsyncClient(timeout=20) as client:
            r = await client.post(f"{PAYER_BASE}/pix", json=payload, headers=PAYER_HEADERS)
        return {
            "status_code": r.status_code,
            "body":        r.text,
            "json":        r.json() if "application/json" in r.headers.get("content-type", "") else None,
        }

    @app.post("/debug/forcar-conquista")
    async def debug_forcar_conquista(request: Request, db: Session = Depends(get_db),
                                      usuario=Depends(get_usuario_atual)):
        body  = await request.json()
        marco = body.get("marco", "10k")
        if marco == "10k":
            usuario.conquista_10k = True
            db.commit()
            asyncio.create_task(email_conquista_placa(usuario.email, usuario.nome, "10k"))
        elif marco == "50k":
            usuario.conquista_10k = True
            usuario.conquista_50k = True
            db.commit()
            asyncio.create_task(email_conquista_placa(usuario.email, usuario.nome, "50k"))
        return {"ok": True, "marco": marco}
