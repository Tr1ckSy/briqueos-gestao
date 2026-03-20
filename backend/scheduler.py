import asyncio
from datetime import date, datetime, timedelta
from sqlalchemy.orm import Session
from database import SessionLocal
import models
from email_service import email_plano_expirando, email_resumo_semanal

async def job_verificar_planos():
    db: Session = SessionLocal()
    try:
        hoje = date.today()
        d3 = (hoje + timedelta(days=3)).isoformat()
        d1 = (hoje + timedelta(days=1)).isoformat()
        hoje_s = hoje.isoformat()

        usuarios = db.query(models.Usuario).filter(
            models.Usuario.plano.in_(["pro", "business"]),
            models.Usuario.plano_expira.isnot(None),
        ).all()

        expirados = avisos3 = avisos1 = 0

        for u in usuarios:
            exp = u.plano_expira
            if not exp:
                continue
            if exp <= hoje_s:
                u.plano = "gratis"
                u.plano_expira = None
                db.commit()
                expirados += 1
            elif exp == d1:
                await email_plano_expirando(u.email, u.nome, u.plano, 1)
                avisos1 += 1
            elif exp == d3:
                await email_plano_expirando(u.email, u.nome, u.plano, 3)
                avisos3 += 1

        print(f"[Scheduler] Planos: {expirados} expirados, {avisos3} avisos 3d, {avisos1} avisos 1d")
    finally:
        db.close()

async def job_resumo_semanal():
    from payer import LIMITES

    LEVELS = [
        {"n": 1, "nome": "Iniciante", "emoji": "🥉", "min": 0},
        {"n": 2, "nome": "Aprendiz", "emoji": "🥈", "min": 500},
        {"n": 3, "nome": "Revendedor", "emoji": "🥇", "min": 2000},
        {"n": 4, "nome": "Profissional", "emoji": "💎", "min": 5000},
        {"n": 5, "nome": "Expert", "emoji": "🚀", "min": 15000},
        {"n": 6, "nome": "Mestre", "emoji": "👑", "min": 50000},
    ]

    def get_nivel(lucro: float) -> dict:
        lv = LEVELS[0]
        for l in LEVELS:
            if lucro >= l["min"]:
                lv = l
        return lv

    db: Session = SessionLocal()
    try:
        sete_dias_atras = (date.today() - timedelta(days=7)).isoformat()
        usuarios = db.query(models.Usuario).filter(models.Usuario.ativo == True).all()

        enviados = 0
        for u in usuarios:
            if not u.compras:
                continue

            vendas_semana = (
                db.query(models.Venda)
                .join(models.Compra)
                .filter(
                    models.Compra.usuario_id == u.id,
                    models.Venda.data_venda >= sete_dias_atras,
                )
                .all()
            )

            lucro_semana = sum(
                v.preco_venda - (v.compra.custo_total if v.compra else 0)
                for v in vendas_semana
            )

            todas_vendas = (
                db.query(models.Venda)
                .join(models.Compra)
                .filter(models.Compra.usuario_id == u.id)
                .all()
            )

            lucro_total = sum(
                v.preco_venda - (v.compra.custo_total if v.compra else 0)
                for v in todas_vendas
            )

            vendidos_ids = {v.compra_id for v in todas_vendas}
            estoque = sum(1 for c in u.compras if c.id not in vendidos_ids)

            nivel = get_nivel(lucro_total)

            dados = {
                "lucro_semana": round(lucro_semana, 2),
                "vendas_semana": len(vendas_semana),
                "lucro_total": round(lucro_total, 2),
                "compras_estoque": estoque,
                "nivel_nome": nivel["nome"],
                "nivel_emoji": nivel["emoji"],
            }

            ok = await email_resumo_semanal(u.email, u.nome, dados)
            if ok:
                enviados += 1

        print(f"[Scheduler] Resumo semanal: {enviados} emails enviados")
    finally:
        db.close()

async def run_scheduler():
    print("[Scheduler] Iniciado")
    tick_horas = 0

    while True:
        await asyncio.sleep(3600)
        tick_horas += 1

        if tick_horas % 24 == 0:
            await job_verificar_planos()

        agora = datetime.now()
        if agora.weekday() == 6 and agora.hour == 20:
            print("[Scheduler] Enviando resumos semanais...")
            await job_resumo_semanal()