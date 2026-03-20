"""
BriqueOS — Migração manual do banco SQLite
Execute: python migrate.py
"""
import sqlite3, os

DB_PATH = "./briqueos.db"

MIGRATIONS = [
    ("ALTER TABLE usuarios ADD COLUMN foto_url TEXT",                "usuarios", "foto_url"),
    ("ALTER TABLE compras  ADD COLUMN foto_url TEXT",                "compras",  "foto_url"),
    ("ALTER TABLE compras  ADD COLUMN notas TEXT",                   "compras",  "notas"),
    ("ALTER TABLE usuarios ADD COLUMN is_admin INTEGER DEFAULT 0",   "usuarios", "is_admin"),
    ("ALTER TABLE usuarios ADD COLUMN plano TEXT DEFAULT 'gratis'",  "usuarios", "plano"),
    ("ALTER TABLE usuarios ADD COLUMN plano_expira TEXT",            "usuarios", "plano_expira"),
    ("ALTER TABLE usuarios ADD COLUMN cakto_email TEXT",             "usuarios", "cakto_email"),
    ("ALTER TABLE usuarios ADD COLUMN conta_pai_id INTEGER",         "usuarios", "conta_pai_id"),
    ("ALTER TABLE usuarios ADD COLUMN conquistas TEXT DEFAULT '[]'", "usuarios", "conquistas"),
    ("ALTER TABLE usuarios ADD COLUMN conquista_10k INTEGER DEFAULT 0","usuarios","conquista_10k"),
    ("ALTER TABLE usuarios ADD COLUMN conquista_50k INTEGER DEFAULT 0","usuarios","conquista_50k"),
    ("ALTER TABLE usuarios ADD COLUMN endereco_rua TEXT",            "usuarios", "endereco_rua"),
    ("ALTER TABLE usuarios ADD COLUMN endereco_numero TEXT",         "usuarios", "endereco_numero"),
    ("ALTER TABLE usuarios ADD COLUMN endereco_bairro TEXT",         "usuarios", "endereco_bairro"),
    ("ALTER TABLE usuarios ADD COLUMN endereco_cidade TEXT",         "usuarios", "endereco_cidade"),
    ("ALTER TABLE usuarios ADD COLUMN endereco_estado TEXT",         "usuarios", "endereco_estado"),
    ("ALTER TABLE usuarios ADD COLUMN endereco_cep TEXT",            "usuarios", "endereco_cep"),
    ("ALTER TABLE usuarios ADD COLUMN whatsapp TEXT",                "usuarios", "whatsapp"),
    ("ALTER TABLE usuarios ADD COLUMN push_subscription TEXT",       "usuarios", "push_subscription"),
    # ── NOVOS (v2) ──────────────────────────────────────────────────────
    ("ALTER TABLE usuarios ADD COLUMN email_verificado INTEGER DEFAULT 0", "usuarios", "email_verificado"),
]

CREATE_LOGS = """
CREATE TABLE IF NOT EXISTS logs_acesso (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    usuario_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
    acao       TEXT    NOT NULL,
    email      TEXT,
    ip         TEXT,
    user_agent TEXT,
    detalhe    TEXT,
    sucesso    INTEGER DEFAULT 1,
    criado_em  DATETIME DEFAULT (datetime('now'))
);
"""

CREATE_RESET_TOKENS = """
CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    token      TEXT    NOT NULL UNIQUE,
    expira_em  DATETIME NOT NULL,
    usado      INTEGER DEFAULT 0,
    criado_em  DATETIME DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS ix_prt_token ON password_reset_tokens(token);
"""


def col_exists(cursor, table, col):
    cursor.execute(f"PRAGMA table_info({table})")
    return any(row[1] == col for row in cursor.fetchall())


def run():
    if not os.path.exists(DB_PATH):
        print("⚠️  Banco não encontrado. Inicie o servidor uma vez e rode novamente.")
        return

    conn   = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    ok     = 0

    for sql, table, col in MIGRATIONS:
        if not col_exists(cursor, table, col):
            try:
                cursor.execute(sql)
                conn.commit()
                print(f"  ✅ Adicionado: {col} em {table}")
                ok += 1
            except Exception as e:
                print(f"  ❌ Erro ({col} em {table}): {e}")
        else:
            print(f"  ⏭️  Já existe: {col} em {table}")

    # Tabelas extras
    cursor.executescript(CREATE_LOGS)
    conn.commit()
    print("  ✅ Tabela logs_acesso: OK")

    cursor.executescript(CREATE_RESET_TOKENS)
    conn.commit()
    print("  ✅ Tabela password_reset_tokens: OK")

    ok += 2

    conn.close()
    print(f"\n✔ {ok} migração(ões)/tabela(s) verificada(s).")
    print(f'\n💡 Para tornar admin: sqlite3 {DB_PATH} "UPDATE usuarios SET is_admin=1 WHERE email=\'seu@email.com\';"')


if __name__ == "__main__":
    print("🔄 BriqueOS — Migrações\n")
    run()