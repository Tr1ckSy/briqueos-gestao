"""
BriqueOS — Admin CRUD (versão otimizada)
Principais correções:
  - get_all_users: de N+1 para 3 queries totais usando aggregation
  - get_stats: eager loading + queries agregadas
  - get_plano_stats: query única com GROUP BY
"""
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func, case, and_
from collections import defaultdict
from datetime import datetime, timedelta, date
import models
from auth import hash_senha


def require_admin(usuario: models.Usuario):
    from fastapi import HTTPException, status
    if not usuario.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Acesso restrito a administradores",
        )


def get_all_users(db: Session) -> list:
    """
    ANTES: 1 query + N*3 queries lazy (N+1 clássico)
    DEPOIS: 3 queries totais com aggregation via SQL
    """
    # Query 1: totais por usuário via aggregation (1 query)
    compra_stats = (
        db.query(
            models.Compra.usuario_id,
            func.count(models.Compra.id).label("total_compras"),
            func.sum(models.Compra.custo_total).label("custo_total"),
        )
        .group_by(models.Compra.usuario_id)
        .all()
    )
    compra_map = {r.usuario_id: r for r in compra_stats}

    # Query 2: totais de vendas via join (1 query)
    venda_stats = (
        db.query(
            models.Compra.usuario_id,
            func.count(models.Venda.id).label("total_vendas"),
            func.sum(models.Venda.preco_venda).label("total_receita"),
            func.sum(
                models.Venda.preco_venda - models.Compra.custo_total
            ).label("total_lucro"),
            func.avg(
                func.julianday(models.Venda.data_venda)
                - func.julianday(models.Compra.data_compra)
            ).label("giro_medio"),
        )
        .join(models.Venda, models.Venda.compra_id == models.Compra.id)
        .group_by(models.Compra.usuario_id)
        .all()
    )
    venda_map = {r.usuario_id: r for r in venda_stats}

    # Query 3: todos os usuários (1 query)
    usuarios = db.query(models.Usuario).order_by(models.Usuario.criado_em.desc()).all()

    result = []
    for u in usuarios:
        cs = compra_map.get(u.id)
        vs = venda_map.get(u.id)
        result.append({
            "id":            u.id,
            "nome":          u.nome,
            "email":         u.email,
            "foto_url":      u.foto_url,
            "ativo":         u.ativo,
            "is_admin":      u.is_admin,
            "criado_em":     u.criado_em.isoformat() if u.criado_em else None,
            "total_compras": cs.total_compras if cs else 0,
            "total_vendas":  vs.total_vendas if vs else 0,
            "total_receita": round(float(vs.total_receita or 0) if vs else 0, 2),
            "total_lucro":   round(float(vs.total_lucro or 0) if vs else 0, 2),
            "custo_total":   round(float(cs.custo_total or 0) if cs else 0, 2),
            "giro_medio":    round(float(vs.giro_medio), 1) if vs and vs.giro_medio else None,
            "plano":         u.plano or "gratis",
            "plano_expira":  u.plano_expira,
        })
    return result


def get_stats(db: Session) -> dict:
    """
    ANTES: iterava todos vendas e acessava v.compra e v.compra.usuario (N+1)
    DEPOIS: queries agregadas com GROUP BY
    """
    hoje = datetime.utcnow()
    mes_inicio = hoje.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

    # Contagens simples (1 query cada)
    total_usuarios = db.query(func.count(models.Usuario.id)).scalar()
    usuarios_ativos = db.query(func.count(models.Usuario.id)).filter(
        models.Usuario.ativo == True
    ).scalar()
    novos_mes = db.query(func.count(models.Usuario.id)).filter(
        models.Usuario.criado_em >= mes_inicio
    ).scalar()

    # Receita e lucro mensais (1 query com GROUP BY)
    receita_mensal = (
        db.query(
            func.substr(models.Venda.data_venda, 1, 7).label("mes"),
            func.sum(models.Venda.preco_venda).label("receita"),
            func.sum(models.Venda.preco_venda - models.Compra.custo_total).label("lucro"),
        )
        .join(models.Compra, models.Venda.compra_id == models.Compra.id)
        .group_by("mes")
        .order_by("mes")
        .all()
    )

    receita_por_mes = {}
    lucro_por_mes = {}
    for r in receita_mensal[-8:]:
        receita_por_mes[r.mes] = round(float(r.receita or 0), 2)
        lucro_por_mes[r.mes] = round(float(r.lucro or 0), 2)

    # Totais globais
    totais = db.query(
        func.count(models.Venda.id).label("total_vendas"),
        func.sum(models.Venda.preco_venda).label("total_receita"),
        func.sum(models.Venda.preco_venda - models.Compra.custo_total).label("total_lucro"),
    ).join(models.Compra, models.Venda.compra_id == models.Compra.id).first()

    total_compras = db.query(func.count(models.Compra.id)).scalar()

    # Crescimento mensal de usuários
    user_por_mes = (
        db.query(
            func.strftime("%Y-%m", models.Usuario.criado_em).label("mes"),
            func.count(models.Usuario.id).label("total"),
        )
        .group_by("mes")
        .order_by("mes")
        .all()
    )
    usuarios_por_mes = {r.mes: r.total for r in user_por_mes[-8:]}

    # Atividade recente com JOIN (1 query, sem N+1)
    atividade = (
        db.query(models.LogAcesso, models.Usuario.nome)
        .outerjoin(models.Usuario, models.LogAcesso.usuario_id == models.Usuario.id)
        .order_by(models.LogAcesso.id.desc())
        .limit(20)
        .all()
    )
    atividade_recente = [
        {
            "tipo": log.acao,
            "descricao": f"{log.acao.capitalize()}: {nome or log.email or '—'}",
            "usuario": nome or log.email or "—",
            "criado_em": log.criado_em.isoformat() if log.criado_em else "",
        }
        for log, nome in atividade
    ]

    # Transações para a seção de transações (com JOIN explícito)
    vendas_join = (
        db.query(models.Venda, models.Compra.titulo, models.Compra.custo_total, models.Usuario.nome)
        .select_from(models.Venda)
        .join(models.Compra, models.Venda.compra_id == models.Compra.id)
        .join(models.Usuario, models.Compra.usuario_id == models.Usuario.id)
        .order_by(models.Venda.data_venda.desc())
        .limit(500)
        .all()
    )
    compras_join = (
        db.query(models.Compra, models.Usuario.nome)
        .select_from(models.Compra)
        .join(models.Usuario, models.Compra.usuario_id == models.Usuario.id)
        .order_by(models.Compra.data_compra.desc())
        .limit(500)
        .all()
    )

    transacoes = []
    for v, titulo, custo_total, nome in vendas_join:
        lucro = v.preco_venda - (custo_total or 0)
        transacoes.append({
            "tipo": "venda", "produto": titulo, "usuario": nome or "—",
            "usuario_id": None,
            "valor": v.preco_venda, "lucro": round(lucro, 2),
            "data": v.data_venda, "canal": v.canal,
        })
    for c, nome in compras_join:
        transacoes.append({
            "tipo": "compra", "produto": c.titulo, "usuario": nome or "—",
            "usuario_id": c.usuario_id,
            "valor": c.custo_total, "lucro": None,
            "data": c.data_compra, "canal": c.fonte,
        })
    transacoes.sort(key=lambda x: x["data"], reverse=True)

    return {
        "total_usuarios":    total_usuarios or 0,
        "usuarios_ativos":   usuarios_ativos or 0,
        "novos_mes":         novos_mes or 0,
        "total_compras":     total_compras or 0,
        "total_vendas":      totais.total_vendas or 0,
        "total_receita":     round(float(totais.total_receita or 0), 2),
        "total_lucro":       round(float(totais.total_lucro or 0), 2),
        "receita_por_mes":   receita_por_mes,
        "lucro_por_mes":     lucro_por_mes,
        "usuarios_por_mes":  usuarios_por_mes,
        "atividade_recente": atividade_recente,
        "transacoes":        transacoes,
    }


def get_plano_stats(db: Session) -> dict:
    """
    ANTES: iterava todos os usuários em Python para calcular planos
    DEPOIS: SQL GROUP BY com CASE WHEN
    """
    hoje = date.today().isoformat()

    stats = (
        db.query(
            func.count(models.Usuario.id).label("total"),
            func.sum(
                case(
                    (and_(models.Usuario.plano == "pro", models.Usuario.plano_expira > hoje), 1),
                    else_=0,
                )
            ).label("pro"),
            func.sum(
                case(
                    (and_(models.Usuario.plano == "business", models.Usuario.plano_expira > hoje), 1),
                    else_=0,
                )
            ).label("business"),
            func.sum(
                case(
                    (
                        and_(
                            models.Usuario.plano.in_(["pro", "business"]),
                            models.Usuario.plano_expira <= hoje,
                        ),
                        1,
                    ),
                    else_=0,
                )
            ).label("expirado"),
        )
        .filter(models.Usuario.is_admin == False)
        .first()
    )

    total    = stats.total or 0
    pro      = stats.pro or 0
    business = stats.business or 0
    expirado = stats.expirado or 0
    gratis   = total - pro - business

    mrr = (pro * 29) + (business * 79)

    business_users = (
        db.query(models.Usuario)
        .filter(
            models.Usuario.plano == "business",
            models.Usuario.plano_expira > hoje,
        )
        .all()
    )

    return {
        "total":          total,
        "pro":            pro,
        "business":       business,
        "gratis":         gratis,
        "expirado":       expirado,
        "mrr":            mrr,
        "arr":            mrr * 12,
        "conversao_pct":  round((pro + business) / total * 100, 1) if total else 0,
        "business_users": [
            {
                "id": u.id, "nome": u.nome, "email": u.email,
                "plano_expira": u.plano_expira,
                "criado_em": u.criado_em.isoformat() if u.criado_em else None,
            }
            for u in business_users
        ],
    }


# Funções CRUD simples (sem alteração estrutural)
def toggle_user_status(db: Session, user_id: int):
    u = db.query(models.Usuario).filter(models.Usuario.id == user_id).first()
    if not u:
        return None
    u.ativo = not u.ativo
    db.commit()
    db.refresh(u)
    return u


def toggle_admin_status(db: Session, user_id: int):
    u = db.query(models.Usuario).filter(models.Usuario.id == user_id).first()
    if not u:
        return None
    u.is_admin = not u.is_admin
    db.commit()
    db.refresh(u)
    return u


def admin_create_user(db: Session, dados):
    u = models.Usuario(
        nome       = dados.nome.strip(),
        email      = dados.email.lower().strip(),
        senha_hash = hash_senha(dados.senha),
        ativo      = dados.ativo,
        is_admin   = dados.is_admin,
    )
    db.add(u)
    db.commit()
    db.refresh(u)
    return u


def admin_update_user(db: Session, user_id: int, dados):
    u = db.query(models.Usuario).filter(models.Usuario.id == user_id).first()
    if not u:
        return None
    u.nome     = dados.nome.strip()
    u.email    = dados.email.lower().strip()
    u.ativo    = dados.ativo
    u.is_admin = dados.is_admin
    if hasattr(dados, "senha") and dados.senha:
        u.senha_hash = hash_senha(dados.senha)
    db.commit()
    db.refresh(u)
    return u


def admin_delete_user(db: Session, user_id: int) -> bool:
    u = db.query(models.Usuario).filter(models.Usuario.id == user_id).first()
    if not u:
        return False
    db.delete(u)
    db.commit()
    return True


def set_plano_usuario(db: Session, user_id: int, plano: str, expira: str = None):
    u = db.query(models.Usuario).filter(models.Usuario.id == user_id).first()
    if not u:
        return None
    u.plano        = plano
    u.plano_expira = expira
    db.commit()
    db.refresh(u)
    return u


def get_logs(db: Session, limit: int = 500) -> list:
    """1 query com JOIN para evitar lazy loading."""
    rows = (
        db.query(models.LogAcesso, models.Usuario.nome)
        .outerjoin(models.Usuario, models.LogAcesso.usuario_id == models.Usuario.id)
        .order_by(models.LogAcesso.id.desc())
        .limit(limit)
        .all()
    )
    return [
        {
            "id":        log.id,
            "acao":      log.acao,
            "email":     log.email,
            "nome":      nome,
            "ip":        log.ip,
            "sucesso":   log.sucesso,
            "detalhe":   str(log.detalhe or ""),
            "criado_em": log.criado_em.isoformat() if log.criado_em else None,
        }
        for log, nome in rows
    ]


def get_anomalias(db: Session) -> list:
    """Versão corrigida com queries otimizadas."""
    anomalias = []
    hoje = datetime.utcnow()

    # Vendas com prejuízo (1 query com JOIN)
    prejuizos = (
        db.query(func.count(models.Venda.id))
        .join(models.Compra)
        .filter(models.Venda.preco_venda - models.Compra.custo_total < -10)
        .scalar()
    ) or 0

    if prejuizos:
        anomalias.append({
            "titulo":     f"{prejuizos} venda(s) com prejuízo",
            "descricao":  f"{prejuizos} vendas com preço abaixo do custo.",
            "severidade": "alta" if prejuizos > 5 else "media",
            "data":       hoje.strftime("%d/%m/%Y %H:%M"),
        })

    # Erros de login na última hora
    hora_atras = hoje - timedelta(hours=1)
    erros_login = (
        db.query(func.count(models.LogAcesso.id))
        .filter(
            models.LogAcesso.acao == "erro_login",
            models.LogAcesso.criado_em >= hora_atras,
        )
        .scalar()
    ) or 0

    if erros_login >= 10:
        anomalias.append({
            "titulo":     f"{erros_login} erros de login na última hora",
            "descricao":  "Possível ataque de força bruta.",
            "severidade": "alta",
            "data":       hoje.strftime("%d/%m/%Y %H:%M"),
        })

    # Produtos parados (1 query)
    cutoff60 = (hoje - timedelta(days=60)).strftime("%Y-%m-%d")
    vendidas_subq = db.query(models.Venda.compra_id).subquery()
    parados = (
        db.query(func.count(models.Compra.id))
        .filter(
            models.Compra.id.notin_(vendidas_subq),
            models.Compra.data_compra <= cutoff60,
        )
        .scalar()
    ) or 0

    if parados > 10:
        anomalias.append({
            "titulo":     f"{parados} produtos parados há 60+ dias",
            "descricao":  f"{parados} produtos sem venda. Capital imobilizado.",
            "severidade": "media",
            "data":       hoje.strftime("%d/%m/%Y %H:%M"),
        })

    return anomalias


def get_retencao(db: Session) -> dict:
    """Versão simplificada e corrigida do cálculo de retenção."""
    hoje = datetime.utcnow().replace(tzinfo=None)

    total = db.query(func.count(models.Usuario.id)).filter(
        models.Usuario.is_admin == False,
        models.Usuario.ativo == True,
    ).scalar() or 0

    if not total:
        return {
            "total_usuarios": 0,
            "retencao_d1": 0, "retencao_d7": 0, "retencao_d30": 0,
            "d1_abs": 0, "d7_abs": 0, "d30_abs": 0, "retencao_mensal": [],
        }

    def conta_retencao(dias_min: int, dias_max: int) -> tuple[int, int]:
        """Retorna (voltaram, elegíveis) para o período."""
        cutoff_cadastro = hoje - timedelta(days=dias_min)
        # Usuários com conta velha o suficiente
        elegíveis = (
            db.query(func.count(models.Usuario.id))
            .filter(
                models.Usuario.is_admin == False,
                models.Usuario.ativo == True,
                models.Usuario.criado_em <= cutoff_cadastro,
            )
            .scalar()
        ) or 0

        # Usuários que fizeram login dentro da janela
        janela_inicio = hoje - timedelta(days=dias_max)
        janela_fim    = hoje - timedelta(days=dias_min)
        voltaram = (
            db.query(func.count(func.distinct(models.LogAcesso.usuario_id)))
            .join(models.Usuario, models.LogAcesso.usuario_id == models.Usuario.id)
            .filter(
                models.LogAcesso.acao == "login",
                models.LogAcesso.criado_em >= janela_inicio,
                models.LogAcesso.criado_em <= janela_fim,
                models.Usuario.is_admin == False,
            )
            .scalar()
        ) or 0

        return voltaram, elegíveis

    d1_abs,  el1  = conta_retencao(1, 2)
    d7_abs,  el7  = conta_retencao(7, 14)
    d30_abs, el30 = conta_retencao(30, 60)

    def pct(n, d): return round(n / d * 100, 1) if d else 0

    # Retenção mensal
    retencao_mensal = []
    for i in range(5, -1, -1):
        mes_dt = (hoje.replace(day=1) - timedelta(days=i * 30)).replace(day=1)
        mes_str = mes_dt.strftime("%Y-%m")
        c, e = conta_retencao(mes_dt.day, 30)
        retencao_mensal.append({"mes": mes_str, "pct": pct(c, e), "abs": c})

    return {
        "total_usuarios": total,
        "retencao_d1":    pct(d1_abs, el1),
        "retencao_d7":    pct(d7_abs, el7),
        "retencao_d30":   pct(d30_abs, el30),
        "d1_abs":  d1_abs, "d7_abs": d7_abs, "d30_abs": d30_abs,
        "retencao_mensal": retencao_mensal,
    }


def get_system_info(db: Session) -> dict:
    import os
    total_u = db.query(func.count(models.Usuario.id)).scalar()
    total_c = db.query(func.count(models.Compra.id)).scalar()
    total_v = db.query(func.count(models.Venda.id)).scalar()
    db_path = "./briqueos.db"
    db_size = "—"
    if os.path.exists(db_path):
        b = os.path.getsize(db_path)
        db_size = f"{b/1024:.1f} KB" if b < 1_048_576 else f"{b/1_048_576:.2f} MB"
    return {
        "version":        "3.1.0",
        "db_type":        "SQLite",
        "db_size":        db_size,
        "total_usuarios": total_u,
        "total_compras":  total_c,
        "total_vendas":   total_v,
        "uptime":         "—",
    }