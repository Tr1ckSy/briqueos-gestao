from pydantic import BaseModel, validator
from typing import Optional
from datetime import datetime

class UsuarioCreate(BaseModel):
    nome: str
    email: str
    senha: str

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

class UsuarioLogin(BaseModel):
    email: str
    senha: str

class UsuarioPublico(BaseModel):
    id: int
    nome: str
    email: str
    foto_url: Optional[str] = None
    is_admin: bool = False
    plano: str = 'gratis'
    plano_expira: Optional[str] = None
    conta_pai_id: Optional[int] = None
    email_verificado: bool = False
    criado_em: Optional[datetime]

    class Config:
        from_attributes = True

class TokenResposta(BaseModel):
    access_token: str
    token_type: str = "bearer"
    usuario: UsuarioPublico

class AtualizarNome(BaseModel):
    nome: str

    @validator("nome")
    def nome_valido(cls, v):
        if len(v.strip()) < 2:
            raise ValueError("Nome deve ter ao menos 2 caracteres")
        return v.strip()

class AtualizarSenha(BaseModel):
    senha_atual: str
    nova_senha: str

    @validator("nova_senha")
    def senha_forte(cls, v):
        if len(v) < 6:
            raise ValueError("Nova senha deve ter ao menos 6 caracteres")
        return v

class AtualizarFoto(BaseModel):
    foto_url: str

class ForgotPassword(BaseModel):
    email: str

    @validator("email")
    def email_valido(cls, v):
        v = v.strip().lower()
        if "@" not in v:
            raise ValueError("E-mail inválido")
        return v

class ResetPassword(BaseModel):
    token: str
    nova_senha: str

    @validator("nova_senha")
    def senha_forte(cls, v):
        if len(v) < 6:
            raise ValueError("Senha deve ter ao menos 6 caracteres")
        return v

class CompraCreate(BaseModel):
    titulo: str
    categoria: str
    condicao: Optional[str] = None
    marca: Optional[str] = None
    modelo: Optional[str] = None
    data_compra: str
    preco_compra: float
    frete: float = 0
    conserto: float = 0
    outros_custos: float = 0
    pagamento: Optional[str] = None
    fonte: Optional[str] = None
    cidade: Optional[str] = None
    link: Optional[str] = None
    foto_url: Optional[str] = None
    notas: Optional[str] = None

    @validator("preco_compra")
    def preco_positivo(cls, v):
        if v <= 0:
            raise ValueError("Preço de compra deve ser maior que zero")
        return v

class Compra(BaseModel):
    id: int
    usuario_id: int
    titulo: str
    categoria: str
    condicao: Optional[str]
    marca: Optional[str]
    modelo: Optional[str]
    data_compra: str
    preco_compra: float
    frete: float
    conserto: float
    outros_custos: float
    custo_total: float
    pagamento: Optional[str]
    fonte: Optional[str]
    cidade: Optional[str]
    link: Optional[str]
    foto_url: Optional[str] = None
    notas: Optional[str] = None
    criado_em: Optional[datetime]
    vendida: bool = False

    class Config:
        from_attributes = True

class VendaUpdate(BaseModel):
    preco_venda: float
    data_venda: str
    canal: Optional[str] = None
    pagamento: Optional[str] = None

    @validator("preco_venda")
    def preco_positivo(cls, v):
        if v <= 0:
            raise ValueError("Preço de venda deve ser maior que zero")
        return v

class VendaCreate(BaseModel):
    compra_id: int
    preco_venda: float
    data_venda: str
    canal: Optional[str] = None
    pagamento: Optional[str] = None

    @validator("preco_venda")
    def preco_positivo(cls, v):
        if v <= 0:
            raise ValueError("Preço de venda deve ser maior que zero")
        return v

class Venda(BaseModel):
    id: int
    compra_id: int
    preco_venda: float
    data_venda: str
    canal: Optional[str]
    pagamento: Optional[str]
    criado_em: Optional[datetime]
    lucro: float = 0

    class Config:
        from_attributes = True