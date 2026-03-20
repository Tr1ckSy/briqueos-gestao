"""
BriqueOS — Admin Schemas
Modelos Pydantic para os endpoints administrativos.
"""
from pydantic import BaseModel, validator
from typing import Optional


class AdminCreateUser(BaseModel):
    nome:     str
    email:    str
    senha:    str
    ativo:    bool = True
    is_admin: bool = False

    @validator("nome")
    def nome_valido(cls, v):
        if len(v.strip()) < 2:
            raise ValueError("Nome deve ter ao menos 2 caracteres")
        return v.strip()

    @validator("senha")
    def senha_forte(cls, v):
        if len(v) < 6:
            raise ValueError("Senha deve ter ao menos 6 caracteres")
        return v


class AdminUpdateUser(BaseModel):
    nome:     str
    email:    str
    ativo:    bool = True
    is_admin: bool = False
    senha:    Optional[str] = None

    @validator("nome")
    def nome_valido(cls, v):
        if len(v.strip()) < 2:
            raise ValueError("Nome deve ter ao menos 2 caracteres")
        return v.strip()

    @validator("senha")
    def senha_forte(cls, v):
        if v is not None and len(v) < 6:
            raise ValueError("Senha deve ter ao menos 6 caracteres")
        return v
