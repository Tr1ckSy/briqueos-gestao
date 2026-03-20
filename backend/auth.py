from datetime import datetime, timedelta
from typing import Optional
import warnings
import logging
# Silencia o aviso do passlib sobre versão do bcrypt
warnings.filterwarnings("ignore", ".*error reading bcrypt version.*")
logging.getLogger("passlib").setLevel(logging.ERROR)
import bcrypt
from jose import JWTError, jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session
from database import get_db
import models

# ─── CONFIGURAÇÃO ─────────────────────────────────────────────────────
SECRET_KEY = "brique-os-super-secret-key-troque-em-producao-2024"
ALGORITHM  = "HS256"
ACCESS_TOKEN_EXPIRE_HOURS = 24 * 7  # 7 dias

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="auth/login")


# ─── SENHA ────────────────────────────────────────────────────────────
def hash_senha(senha: str) -> str:
    return bcrypt.hashpw(senha.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")

def verificar_senha(senha_plana: str, senha_hash: str) -> bool:
    return bcrypt.checkpw(senha_plana.encode("utf-8"), senha_hash.encode("utf-8"))


# ─── TOKEN JWT ────────────────────────────────────────────────────────
def criar_token(user_id: int, email: str) -> str:
    expira  = datetime.utcnow() + timedelta(hours=ACCESS_TOKEN_EXPIRE_HOURS)
    payload = {"sub": str(user_id), "email": email, "exp": expira}
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)

def decodificar_token(token: str) -> Optional[dict]:
    try:
        return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError:
        return None


# ─── USUÁRIO ATUAL ────────────────────────────────────────────────────
def get_usuario_atual(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db)
) -> models.Usuario:
    exc = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Token inválido ou expirado",
        headers={"WWW-Authenticate": "Bearer"},
    )
    payload = decodificar_token(token)
    if not payload:
        raise exc

    user_id = payload.get("sub")
    if not user_id:
        raise exc

    usuario = db.query(models.Usuario).filter(
        models.Usuario.id == int(user_id)
    ).first()

    if not usuario or not usuario.ativo:
        raise exc

    return usuario