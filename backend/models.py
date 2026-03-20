from sqlalchemy import Column, Integer, String, Float, Boolean, ForeignKey, DateTime, Text, Index
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from database import Base


class Usuario(Base):
    __tablename__ = "usuarios"

    id               = Column(Integer, primary_key=True, index=True)
    nome             = Column(String, nullable=False)
    email            = Column(String, unique=True, index=True, nullable=False)
    senha_hash       = Column(String, nullable=False)
    foto_url         = Column(Text, nullable=True)
    ativo            = Column(Boolean, default=True)
    is_admin         = Column(Boolean, default=False)
    email_verificado = Column(Boolean, default=False)
    # Plano
    plano            = Column(String, default="gratis", index=True)
    plano_expira     = Column(String, nullable=True)
    cakto_email      = Column(String, nullable=True)
    # Multi-usuário Business
    conta_pai_id     = Column(Integer, ForeignKey("usuarios.id"), nullable=True, index=True)
    # Push notifications
    push_subscription = Column(Text, nullable=True)
    # Conquistas
    conquista_10k    = Column(Boolean, default=False)
    conquista_50k    = Column(Boolean, default=False)
    endereco_rua     = Column(String, nullable=True)
    endereco_numero  = Column(String, nullable=True)
    endereco_bairro  = Column(String, nullable=True)
    endereco_cidade  = Column(String, nullable=True)
    endereco_estado  = Column(String, nullable=True)
    endereco_cep     = Column(String, nullable=True)
    criado_em        = Column(DateTime(timezone=True), server_default=func.now())

    compras = relationship("Compra", back_populates="usuario",
                           foreign_keys="Compra.usuario_id", cascade="all, delete-orphan")
    logs    = relationship("LogAcesso", back_populates="usuario", cascade="all, delete-orphan")


class Compra(Base):
    __tablename__ = "compras"

    id            = Column(Integer, primary_key=True, index=True)
    usuario_id    = Column(Integer, ForeignKey("usuarios.id"), nullable=False, index=True)
    titulo        = Column(String, nullable=False)
    categoria     = Column(String, nullable=False, index=True)
    condicao      = Column(String)
    marca         = Column(String)
    modelo        = Column(String)
    data_compra   = Column(String, nullable=False, index=True)
    preco_compra  = Column(Float, nullable=False)
    frete         = Column(Float, default=0)
    conserto      = Column(Float, default=0)
    outros_custos = Column(Float, default=0)
    custo_total   = Column(Float, nullable=False)
    pagamento     = Column(String)
    fonte         = Column(String)
    cidade        = Column(String)
    link          = Column(String)
    foto_url      = Column(String, nullable=True)   # caminho do arquivo, não base64
    notas         = Column(Text, nullable=True)
    criado_em     = Column(DateTime(timezone=True), server_default=func.now())

    usuario = relationship("Usuario", back_populates="compras", foreign_keys=[usuario_id])
    venda   = relationship("Venda", back_populates="compra", uselist=False, cascade="all, delete-orphan")


class Venda(Base):
    __tablename__ = "vendas"

    id          = Column(Integer, primary_key=True, index=True)
    compra_id   = Column(Integer, ForeignKey("compras.id"), nullable=False, unique=True)
    preco_venda = Column(Float, nullable=False)
    data_venda  = Column(String, nullable=False, index=True)
    canal       = Column(String, index=True)
    pagamento   = Column(String)
    criado_em   = Column(DateTime(timezone=True), server_default=func.now())

    compra = relationship("Compra", back_populates="venda")


class LogAcesso(Base):
    __tablename__ = "logs_acesso"

    id         = Column(Integer, primary_key=True, index=True)
    usuario_id = Column(Integer, ForeignKey("usuarios.id"), nullable=True, index=True)
    acao       = Column(String, nullable=False, index=True)
    email      = Column(String, nullable=True)
    ip         = Column(String, nullable=True)
    user_agent = Column(String, nullable=True)
    detalhe    = Column(Text, nullable=True)
    sucesso    = Column(Boolean, default=True)
    criado_em  = Column(DateTime(timezone=True), server_default=func.now(), index=True)

    usuario = relationship("Usuario", back_populates="logs")


class PasswordResetToken(Base):
    """Tokens de redefinição de senha — expiram em 1 hora."""
    __tablename__ = "password_reset_tokens"

    id         = Column(Integer, primary_key=True, index=True)
    usuario_id = Column(Integer, ForeignKey("usuarios.id", ondelete="CASCADE"), nullable=False)
    token      = Column(String(64), unique=True, index=True, nullable=False)
    expira_em  = Column(DateTime, nullable=False)
    usado      = Column(Boolean, default=False)
    criado_em  = Column(DateTime(timezone=True), server_default=func.now())

    usuario = relationship("Usuario")