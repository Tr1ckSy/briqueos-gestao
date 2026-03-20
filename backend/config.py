"""
BriqueOS — Configuração centralizada via variáveis de ambiente.
Nunca coloque valores sensíveis diretamente no código.

Crie um arquivo .env na raiz do projeto (NUNCA faça commit dele):
    SECRET_KEY=gere-com-secrets.token_hex(32)
    DATABASE_URL=sqlite:///./briqueos.db
    GMAIL_USER=seuemail@gmail.com
    GMAIL_PASSWORD=sua-senha-de-app
    ADMIN_EMAIL=admin@seudominio.com
    PAYER_TOKEN=seu-token-payer
    VAPID_PUBLIC_KEY=sua-chave-vapid-publica
    VAPID_PRIVATE_KEY=sua-chave-vapid-privada
    CORS_ORIGINS=http://localhost:8000,https://seudominio.com
    ENVIRONMENT=development
"""
import os
import secrets
from functools import lru_cache

# Importação opcional — não quebra em produção sem o pacote
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass


class Settings:
    # ── Segurança ──────────────────────────────────────────────
    SECRET_KEY: str = os.getenv("SECRET_KEY", "")
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_HOURS: int = int(os.getenv("TOKEN_EXPIRE_HOURS", "168"))  # 7 dias

    # ── Banco de dados ─────────────────────────────────────────
    DATABASE_URL: str = os.getenv("DATABASE_URL", "sqlite:///./briqueos.db")

    # ── Email ──────────────────────────────────────────────────
    GMAIL_USER: str = os.getenv("GMAIL_USER", "")
    GMAIL_PASSWORD: str = os.getenv("GMAIL_PASSWORD", "")
    ADMIN_EMAIL: str = os.getenv("ADMIN_EMAIL", "admin@exemplo.com")

    # ── Pagamento ──────────────────────────────────────────────
    PAYER_TOKEN: str = os.getenv("PAYER_TOKEN", "")
    PAYER_BASE: str = os.getenv("PAYER_BASE", "https://api.betpaympix.com/v1")

    # ── Push notifications ─────────────────────────────────────
    VAPID_PUBLIC_KEY: str = os.getenv("VAPID_PUBLIC_KEY", "")
    VAPID_PRIVATE_KEY: str = os.getenv("VAPID_PRIVATE_KEY", "")

    # ── CORS ───────────────────────────────────────────────────
    CORS_ORIGINS: list[str] = os.getenv(
        "CORS_ORIGINS", "http://localhost:8000"
    ).split(",")

    # ── Ambiente ───────────────────────────────────────────────
    ENVIRONMENT: str = os.getenv("ENVIRONMENT", "development")
    IS_PRODUCTION: bool = ENVIRONMENT == "production"

    def validate(self) -> None:
        """Falha no startup se configurações críticas estiverem ausentes."""
        errors = []
        if not self.SECRET_KEY:
            errors.append("SECRET_KEY não definida. Gere com: python -c \"import secrets; print(secrets.token_hex(32))\"")
        if len(self.SECRET_KEY) < 32:
            errors.append("SECRET_KEY muito curta — mínimo 32 caracteres.")
        if self.IS_PRODUCTION:
            if not self.GMAIL_USER:
                errors.append("GMAIL_USER não definido.")
            if not self.PAYER_TOKEN:
                errors.append("PAYER_TOKEN não definido.")
        if errors:
            raise RuntimeError("Erros de configuração:\n" + "\n".join(f"  - {e}" for e in errors))


@lru_cache()
def get_settings() -> Settings:
    s = Settings()
    s.validate()
    return s


settings = get_settings()