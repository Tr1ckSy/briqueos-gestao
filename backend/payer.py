"""
BriqueOS — Payer PIX Integration
Planos: gratis | pro | business
"""
import httpx
from datetime import date, datetime, timedelta
from fastapi import HTTPException
from sqlalchemy.orm import Session
import models

PAYER_TOKEN   = "PP_19736961e9579dbf10bcfa2311503d015affeb4cde044204104c7bc57ef1ad26"
PAYER_BASE    = "https://api.betpaympix.com/v1"
PAYER_HEADERS = {
    "Authorization": f"Bearer {PAYER_TOKEN}",
    "Content-Type":  "application/json",
}

# Preços em centavos
PRECOS = {
    "pro":      {"mensal": 2900,  "anual": 24300},
    "business": {"mensal": 7900,  "anual": 66300},
}

DIAS_PLANO = {"mensal": 30, "anual": 365}

LIMITES = {
    "gratis": {
        "compras":    15,
        "foto":       False,
        "exportar":   False,
        "relatorios": False,
        "alertas":    False,
        "historico":  7,
        "usuarios":   1,
        "suporte":    "comunidade",
    },
    "pro": {
        "compras":    999999,
        "foto":       True,
        "exportar":   True,
        "relatorios": True,
        "alertas":    True,
        "historico":  90,
        "usuarios":   1,
        "suporte":    "app",
    },
    "business": {
        "compras":    999999,
        "foto":       True,
        "exportar":   True,
        "relatorios": True,
        "alertas":    True,
        "historico":  999999,
        "usuarios":   5,
        "suporte":    "whatsapp",
    },
}

MSG_UPGRADE = {
    "foto":       "Envio de fotos disponível no plano Pro ou Business.",
    "exportar":   "Exportação CSV disponível no plano Pro ou Business.",
    "relatorios": "Relatórios avançados disponíveis no plano Pro ou Business.",
    "alertas":    "Alertas de estoque disponíveis no plano Pro ou Business.",
}


def _plano_ativo(usuario: models.Usuario) -> str:
    plano = usuario.plano or "gratis"
    if plano in ("pro", "business") and usuario.plano_expira:
        try:
            exp = datetime.strptime(usuario.plano_expira, "%Y-%m-%d").date()
            if date.today() > exp:
                return "gratis"
        except ValueError:
            pass
    return plano


def verificar_limite_compras(db: Session, usuario: models.Usuario):
    plano  = _plano_ativo(usuario)
    if plano == "gratis" and usuario.plano != "gratis":
        usuario.plano        = "gratis"
        usuario.plano_expira = None
        db.commit()

    limite = LIMITES[plano]["compras"]
    total  = db.query(models.Compra).filter(
        models.Compra.usuario_id == usuario.id
    ).count()

    if total >= limite:
        raise HTTPException(
            status_code=402,
            detail={
                "erro":     "limite_plano",
                "plano":    plano,
                "limite":   limite,
                "atual":    total,
                "mensagem": f"Limite de {limite} compras do plano Grátis atingido.",
            }
        )


def verificar_funcionalidade(usuario: models.Usuario, func: str):
    plano = _plano_ativo(usuario)
    if not LIMITES.get(plano, LIMITES["gratis"]).get(func, False):
        raise HTTPException(
            status_code=402,
            detail={
                "erro":     "funcionalidade_bloqueada",
                "func":     func,
                "plano":    plano,
                "mensagem": MSG_UPGRADE.get(func, "Funcionalidade não disponível no seu plano."),
            }
        )


def get_plano_info(usuario: models.Usuario) -> dict:
    plano    = _plano_ativo(usuario)
    expirado = (plano == "gratis" and (usuario.plano or "gratis") != "gratis")
    return {
        "plano":        plano,
        "plano_expira": usuario.plano_expira,
        "expirado":     expirado,
        "limites":      LIMITES.get(plano, LIMITES["gratis"]),
    }


async def criar_cobranca(nome: str, email: str, cpf: str,
                         plano: str, tipo: str, callback_url: str) -> dict:
    cpf_limpo = "".join(d for d in cpf if d.isdigit())
    if len(cpf_limpo) != 11:
        raise HTTPException(status_code=400, detail="CPF inválido — 11 dígitos.")

    amount = PRECOS.get(plano, PRECOS["pro"]).get(tipo, PRECOS["pro"]["mensal"])

    payload = {
        "amount":            amount,
        "generatedName":     nome,
        "generatedEmail":    email.lower().strip(),
        "generatedDocument": cpf_limpo,
        "callbackUrl":       callback_url,
        "expiresIn":         600,
    }

    async with httpx.AsyncClient(timeout=20) as client:
        r = await client.post(f"{PAYER_BASE}/pix", json=payload, headers=PAYER_HEADERS)

    if not r.is_success:
        raise HTTPException(status_code=502,
                            detail=f"Erro ao gerar cobrança PIX: {r.text[:300]}")

    data = r.json()
    return {
        "ok":             True,
        "transaction_id": data.get("id"),
        "pix_key":        data.get("qrCodeText"),
        "qr_code":        data.get("qrCodeText"),
        "qr_image":       data.get("qrCodeBase64"),
        "qr_url":         data.get("qrCodeUrl"),
        "amount":         amount,
        "expires_in":     600,
        "plano":          plano,
        "tipo":           tipo,
        "raw":            data,
    }


async def consultar_status(transaction_id: str) -> dict:
    async with httpx.AsyncClient(timeout=10) as client:
        r = await client.get(
            f"{PAYER_BASE}/pix",
            params={"id": transaction_id},
            headers=PAYER_HEADERS,
        )
    if not r.is_success:
        raise HTTPException(status_code=502, detail="Erro ao consultar status PIX")
    data = r.json()
    return {"status": data.get("status", "PENDING"), "raw": data}


def processar_webhook_payer(db: Session, payload: dict) -> dict:
    status = (payload.get("status") or "").upper()
    email  = (payload.get("email") or payload.get("generatedEmail") or "").lower().strip()
    plano  = payload.get("plano") or "pro"
    tipo   = payload.get("tipo") or "mensal"

    if not email:
        return {"status": "ignorado", "motivo": "sem email"}

    usuario = db.query(models.Usuario).filter(
        (models.Usuario.email == email) |
        (models.Usuario.cakto_email == email)
    ).first()

    if not usuario:
        return {"status": "ignorado", "motivo": f"usuário não encontrado: {email}"}

    if status == "COMPLETED":
        dias = DIAS_PLANO.get(tipo, 30)
        expira = (date.today() + timedelta(days=dias)).isoformat()
        usuario.plano        = plano
        usuario.plano_expira = expira
        usuario.cakto_email  = email
        db.commit()
        return {"status": "ok", "acao": "plano_ativado", "usuario": email,
                "plano": plano, "expira": expira}

    elif status in ("EXPIRED", "CANCELLED"):
        return {"status": "ignorado", "motivo": f"status: {status}"}

    return {"status": "ignorado", "motivo": f"status não tratado: {status}"}