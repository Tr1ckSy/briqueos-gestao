"""
BriqueOS — Logger de Acesso
Registra logins, logouts e ações importantes no banco.
"""
from sqlalchemy.orm import Session
from fastapi import Request
import models
import json


def registrar(
    db: Session,
    acao: str,
    request: Request = None,
    usuario_id: int = None,
    email: str = None,
    sucesso: bool = True,
    detalhe: dict = None,
):
    """Registra uma ação no log de acesso."""
    ip         = None
    user_agent = None

    if request:
        # Pega IP real mesmo atrás de proxy
        forwarded = request.headers.get("X-Forwarded-For")
        ip = forwarded.split(",")[0].strip() if forwarded else request.client.host
        user_agent = request.headers.get("User-Agent", "")[:200]

    log = models.LogAcesso(
        usuario_id = usuario_id,
        acao       = acao,
        email      = email,
        ip         = ip,
        user_agent = user_agent,
        detalhe    = json.dumps(detalhe, ensure_ascii=False) if detalhe else None,
        sucesso    = sucesso,
    )
    db.add(log)
    db.commit()
