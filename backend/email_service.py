"""
BriqueOS — Email Service via Gmail SMTP
"""
import aiosmtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

GMAIL_USER     = "saintszinmaker@gmail.com"
GMAIL_PASSWORD = "wcra gtrk iqnt apai"
ADMIN_EMAIL    = "iclouddelucas@gmail.com"
BASE_URL       = "http://localhost:8000"


async def _send(to: str, subject: str, html: str) -> bool:
    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"]    = f"BriqueOS <{GMAIL_USER}>"
        msg["To"]      = to
        msg.attach(MIMEText(html, "html"))
        await aiosmtplib.send(
            msg,
            hostname="smtp.gmail.com",
            port=465,
            username=GMAIL_USER,
            password=GMAIL_PASSWORD,
            use_tls=True,
        )
        print(f"[EMAIL] ✅ Enviado para {to} — {subject}")
        return True
    except Exception as e:
        print(f"[EMAIL] ❌ Erro ao enviar para {to}: {e}")
        return False


# ─── BASE ─────────────────────────────────────────────────────────────

def _base(accent: str, hero_color: str, conteudo: str, rodape_extra: str = "") -> str:
    return f"""<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Syne:wght@700;800;900&family=DM+Sans:wght@400;500;600&display=swap');
  * {{ margin:0; padding:0; box-sizing:border-box; }}
  body {{ background:#08090D; font-family:'DM Sans',-apple-system,sans-serif; -webkit-font-smoothing:antialiased; }}
  a {{ text-decoration:none; }}
</style>
</head>
<body style="background:#08090D;margin:0;padding:0;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#08090D;padding:48px 16px;">
<tr><td align="center">
<table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">
  <tr><td align="center" style="padding-bottom:32px;">
    <table cellpadding="0" cellspacing="0">
      <tr>
        <td style="background:linear-gradient(135deg,#FF6B2B,#FF3D00);border-radius:12px;width:42px;height:42px;text-align:center;line-height:42px;font-size:20px;">🏠</td>
        <td style="padding-left:10px;font-family:'Syne',sans-serif;font-size:22px;font-weight:900;color:#E8EDF5;letter-spacing:-0.5px;">Brique<span style="color:#FF6B2B;">OS</span></td>
      </tr>
    </table>
  </td></tr>
  <tr><td style="background:#0C0E14;border:1px solid rgba(255,255,255,0.06);border-radius:20px;overflow:hidden;">
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr><td style="height:4px;background:{accent};font-size:0;line-height:0;">&nbsp;</td></tr>
    </table>
    {conteudo}
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr><td style="border-top:1px solid rgba(255,255,255,0.05);padding:24px 32px;text-align:center;">
        <p style="font-family:'DM Sans',sans-serif;font-size:11px;color:#2D3748;line-height:1.8;margin-bottom:6px;">
          <a href="#" style="color:#3D4A5C;text-decoration:none;margin:0 8px;">Suporte</a>
          <a href="{BASE_URL}/planos.html" style="color:#3D4A5C;text-decoration:none;margin:0 8px;">Planos</a>
          <a href="{BASE_URL}" style="color:#3D4A5C;text-decoration:none;margin:0 8px;">Acessar app</a>
        </p>
        <p style="font-family:'DM Sans',sans-serif;font-size:11px;color:#232B38;line-height:1.6;">
          &copy; 2025 BriqueOS &middot; Sistema de controle de revendas<br/>
          {rodape_extra if rodape_extra else 'Você recebeu este email por ter uma conta no BriqueOS.'}
        </p>
      </td></tr>
    </table>
  </td></tr>
</table>
</td></tr>
</table>
</body>
</html>"""


def _hero(emoji: str, titulo: str, subtitulo: str, cor_radial: str) -> str:
    return f"""
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr><td style="padding:52px 48px 40px;text-align:center;background:radial-gradient(ellipse 80% 60% at 50% 0%,{cor_radial},transparent 70%);">
        <div style="font-size:52px;margin-bottom:20px;line-height:1;">{emoji}</div>
        <div style="font-family:'Syne',sans-serif;font-size:28px;font-weight:900;color:#F0F4FA;letter-spacing:-0.8px;line-height:1.2;margin-bottom:12px;">{titulo}</div>
        <div style="font-family:'DM Sans',sans-serif;font-size:14px;color:#6B7A90;line-height:1.7;max-width:380px;margin:0 auto;">{subtitulo}</div>
      </td></tr>
    </table>"""


def _plan_card(label: str, cor: str, sub_esquerda: str, sub_direita: str) -> str:
    return f"""
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:0;">
      <tr><td style="padding:0 32px 20px;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background:{cor}10;border:1px solid {cor}28;border-radius:14px;padding:20px 24px;">
          <tr>
            <td style="vertical-align:middle;">
              <div style="font-family:'DM Sans',sans-serif;font-size:10px;font-weight:600;color:{cor};text-transform:uppercase;letter-spacing:1.2px;margin-bottom:6px;">{sub_esquerda}</div>
              <div style="font-family:'Syne',sans-serif;font-size:22px;font-weight:900;color:#F0F4FA;">{label}</div>
            </td>
            <td align="right" style="vertical-align:middle;">
              <div style="font-family:'DM Sans',sans-serif;font-size:13px;color:#6B7A90;text-align:right;line-height:1.7;">{sub_direita}</div>
            </td>
          </tr>
        </table>
      </td></tr>
    </table>"""


def _info_rows(*rows) -> str:
    html = '<table width="100%" cellpadding="0" cellspacing="0"><tr><td style="padding:0 32px 20px;"><table width="100%" cellpadding="0" cellspacing="0">'
    for label, value, color in rows:
        html += f"""
        <tr><td style="padding:13px 16px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:10px;margin-bottom:8px;">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td style="font-family:'DM Sans',sans-serif;font-size:12px;color:#6B7A90;">{label}</td>
              <td align="right" style="font-family:'DM Sans',sans-serif;font-size:13px;font-weight:700;color:{color};">{value}</td>
            </tr>
          </table>
        </td></tr>
        <tr><td style="height:8px;"></td></tr>"""
    html += '</table></td></tr></table>'
    return html


def _features(items: list, icon_bg: str, icon_color: str) -> str:
    rows = ""
    last = len(items) - 1
    for i, (icon, text) in enumerate(items):
        border = "" if i == last else "border-bottom:1px solid rgba(255,255,255,0.04);"
        rows += f"""
        <tr>
          <td width="22" style="vertical-align:top;padding:10px 0;">
            <div style="width:22px;height:22px;background:{icon_bg};border-radius:5px;text-align:center;line-height:22px;font-size:12px;color:{icon_color};">{icon}</div>
          </td>
          <td style="padding:10px 0 10px 12px;font-family:'DM Sans',sans-serif;font-size:13px;color:#8A9BB0;line-height:1.5;{border}">{text}</td>
        </tr>"""
    return f"""
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr><td style="padding:0 32px 8px;">
        <table width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid rgba(255,255,255,0.05);padding-top:20px;">
          <tr><td colspan="2" style="font-family:'DM Sans',sans-serif;font-size:10px;font-weight:600;color:#3D4A5C;text-transform:uppercase;letter-spacing:1.2px;padding-bottom:14px;">Recursos desbloqueados</td></tr>
          {rows}
        </table>
      </td></tr>
    </table>"""



def _banner_card(emoji: str, titulo: str, texto: str, bg: str, border: str) -> str:
    return f"""
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr><td style="padding:0 32px 32px;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background:{bg};border:1px solid {border};border-radius:14px;padding:20px 22px;">
          <tr>
            <td width="48" style="vertical-align:middle;font-size:34px;line-height:1;">{emoji}</td>
            <td style="padding-left:14px;vertical-align:middle;">
              <div style="font-family:'DM Sans',sans-serif;font-size:14px;font-weight:600;color:#E8EDF5;margin-bottom:6px;">{titulo}</div>
              <div style="font-family:'DM Sans',sans-serif;font-size:13px;color:#6B7A90;line-height:1.6;">{texto}</div>
            </td>
          </tr>
        </table>
      </td></tr>
    </table>"""


def _cta(texto: str, url: str, cor: str) -> str:
    return f"""
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr><td align="center" style="padding:0 32px 48px;">
        <a href="{url}" style="display:inline-block;background:{cor};color:#fff;font-family:'Syne',sans-serif;font-size:14px;font-weight:700;padding:15px 40px;border-radius:12px;text-decoration:none;letter-spacing:0.3px;">{texto} &rarr;</a>
      </td></tr>
    </table>"""


def _senha_box(senha: str) -> str:
    return f"""
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr><td style="padding:0 32px 28px;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background:rgba(168,85,247,0.07);border:1px solid rgba(168,85,247,0.18);border-radius:14px;padding:24px;text-align:center;">
          <tr><td>
            <div style="font-family:'DM Sans',sans-serif;font-size:10px;font-weight:600;color:#7A8699;text-transform:uppercase;letter-spacing:1.2px;margin-bottom:14px;">🔑 Sua senha temporária</div>
            <div style="font-family:'Courier New',monospace;font-size:26px;font-weight:800;color:#A855F7;letter-spacing:5px;">{senha}</div>
            <div style="font-family:'DM Sans',sans-serif;font-size:11px;color:#3D4A5C;margin-top:12px;">Troque sua senha após o primeiro acesso em Meu Perfil</div>
          </td></tr>
        </table>
      </td></tr>
    </table>"""



def _spacer(h: int = 8) -> str:
    return f'<table width="100%" cellpadding="0" cellspacing="0"><tr><td style="height:{h}px;"></td></tr></table>'


# ─── TEMPLATES EXISTENTES ─────────────────────────────────────────────

async def email_boas_vindas(to: str, nome: str) -> bool:
    p = nome.split()[0]
    features = [
        ("✦", f"Registre compras e vendas com cálculo automático de <span style='color:#D0D8E4;font-weight:600;'>lucro e ROI</span>"),
        ("✦", "Controle seu estoque e identifique produtos parados"),
        ("✦", f"Evolua de nível e <span style='color:#D0D8E4;font-weight:600;'>ganhe bônus reais</span> — mais compras, fotos e alertas grátis!"),
        ("✦", f"Faça upgrade para o <span style='color:#FF6B2B;font-weight:600;'>Plano Pro</span> por R$ 29/mês quando quiser crescer"),
    ]
    corpo = (
        _hero("🎉", f"Bem-vindo ao BriqueOS,<br/>{p}!", "Sua conta foi criada com sucesso. Agora você tem controle total das suas revendas.", "rgba(255,107,43,0.08)")
        + _plan_card("Grátis", "#FF6B2B", "Plano atual", "Até 15 compras<br/>cadastradas")
        + _spacer(4)
        + _features(features, "rgba(255,107,43,0.12)", "#FF6B2B")
        + _spacer(16)
        + _cta("Acessar meu painel", BASE_URL, "linear-gradient(135deg,#FF6B2B,#FF3D00)")
    )
    html = _base("linear-gradient(90deg,#FF6B2B,#FF9A3C,#FFB800)", "rgba(255,107,43,0.08)", corpo)
    return await _send(to, f"🎉 Bem-vindo ao BriqueOS, {p}!", html)


async def email_plano_ativado(to: str, nome: str, plano: str, expira: str) -> bool:
    p      = nome.split()[0]
    is_biz = plano == "business"
    label  = "Business" if is_biz else "Pro"
    emoji  = "🏢" if is_biz else "⚡"
    preco  = "R$ 79" if is_biz else "R$ 29"

    if is_biz:
        accent = "linear-gradient(90deg,#A855F7,#4D9EFF)"
        radial = "rgba(168,85,247,0.08)"
        cor    = "#A855F7"
        icon_bg, icon_cor = "rgba(168,85,247,0.12)", "#A855F7"
        btn_cor = "linear-gradient(135deg,#A855F7,#7C3AED)"
        features = [
            ("✓", "Tudo do Pro incluído"),
            ("✓", f"Até <span style='color:#D0D8E4;font-weight:600;'>5 usuários</span> na mesma conta"),
            ("✓", "Backup automático diário"),
            ("✓", "Relatórios personalizados e API de integração"),
            ("✓", f"Suporte via <span style='color:#D0D8E4;font-weight:600;'>WhatsApp prioritário</span>"),
        ]
    else:
        accent = "linear-gradient(90deg,#FF6B2B,#FFB800)"
        radial = "rgba(255,107,43,0.08)"
        cor    = "#FF6B2B"
        icon_bg, icon_cor = "rgba(255,107,43,0.12)", "#FF6B2B"
        btn_cor = "linear-gradient(135deg,#FF6B2B,#FF3D00)"
        features = [
            ("✓", f"Compras <span style='color:#D0D8E4;font-weight:600;'>ilimitadas</span> cadastradas"),
            ("✓", "Relatórios avançados e exportação CSV"),
            ("✓", "Foto dos produtos e alertas de estoque"),
            ("✓", "Suporte via app"),
        ]

    corpo = (
        _hero(emoji, f"Plano {label} ativado!", f"Pagamento confirmado. Aproveite todos os recursos premium, {p}.", radial)
        + _info_rows(
            ("Plano",      f"{label} {emoji}", cor),
            ("Válido até", expira,             "#F0F4FA"),
            ("Valor",      f"{preco}/mês",     "#F0F4FA"),
        )
        + _features(features, icon_bg, icon_cor)
    )
    if is_biz:
        corpo += _banner_card("👥", "Convide sua equipe",
            "Adicione até 4 membros extras pelo painel.",
            "rgba(168,85,247,0.06)", "rgba(168,85,247,0.14)")
    corpo += _cta("Acessar agora", BASE_URL, btn_cor)

    html = _base(accent, radial, corpo)
    return await _send(to, f"{emoji} Plano {label} ativado com sucesso!", html)


async def email_plano_expirando(to: str, nome: str, plano: str, dias: int) -> bool:
    p      = nome.split()[0]
    label  = "Business" if plano == "business" else "Pro"
    urgente = dias <= 1
    emoji  = "🚨" if urgente else "⏰"
    accent = "linear-gradient(90deg,#FF4D6A,#FF6B2B)" if urgente else "linear-gradient(90deg,#FFB800,#FF6B2B)"
    radial = "rgba(255,77,106,0.08)" if urgente else "rgba(255,184,0,0.07)"
    msg    = f"expira <span style='color:#FF4D6A;font-weight:700;'>hoje</span>" if urgente else f"expira em <span style='color:#FFB800;font-weight:700;'>{dias} dias</span>"

    perdas = [
        ("⚠", "Compras ilimitadas &rarr; limitado pelo nível"),
        ("⚠", "Relatórios avançados bloqueados"),
        ("⚠", "Exportação CSV desativada"),
        ("⚠", "Fotos dos produtos inacessíveis"),
    ]

    corpo = (
        _hero(emoji, f"Seu plano {label} {msg}", f"Renove agora para não perder o acesso a todos os recursos premium, {p}.", radial)
        + """<table width="100%" cellpadding="0" cellspacing="0">
          <tr><td style="padding:0 32px 24px;">
            <table width="100%" cellpadding="0" cellspacing="0" style="background:rgba(255,184,0,0.06);border:1px solid rgba(255,184,0,0.16);border-radius:14px;padding:20px 22px;">
              <tr><td style="font-family:'DM Sans',sans-serif;font-size:10px;font-weight:600;color:#FFB800;text-transform:uppercase;letter-spacing:1.2px;padding-bottom:14px;">O que você perde sem renovar</td></tr>"""
        + "".join([f"""
              <tr>
                <td width="22" style="vertical-align:top;padding:9px 0;">
                  <div style="width:22px;height:22px;background:rgba(255,77,106,0.12);border-radius:5px;text-align:center;line-height:22px;font-size:12px;color:#FF4D6A;">{ic}</div>
                </td>
                <td style="padding:9px 0 9px 12px;font-family:'DM Sans',sans-serif;font-size:13px;color:#8A9BB0;border-bottom:1px solid rgba(255,255,255,0.04);line-height:1.5;">{tx}</td>
              </tr>""" for ic, tx in perdas])
        + """
            </table>
          </td></tr>
        </table>"""
        + _cta("Renovar plano agora", f"{BASE_URL}/planos.html",
               "linear-gradient(135deg,#FFB800,#FF8F00)" if not urgente else "linear-gradient(135deg,#FF4D6A,#e03050)")
        + """<table width="100%" cellpadding="0" cellspacing="0">
          <tr><td align="center" style="padding:0 32px 32px;">
            <p style="font-family:'DM Sans',sans-serif;font-size:11px;color:#3D4A5C;">Seus dados ficam salvos mesmo sem renovar.</p>
          </td></tr>
        </table>"""
    )
    html = _base(accent, radial, corpo)
    return await _send(to, f"{emoji} Seu plano {label} expira em {dias} dia(s)!", html)




async def email_sub_usuario_convidado(to: str, nome_convidador: str, senha_temp: str) -> bool:
    features = [
        ("✓", "Use o email que recebeu este convite para fazer login"),
        ("✓", "Acesse o painel clicando no botão abaixo"),
        ("🔒", f"Troque sua senha em <span style='color:#E8EDF5;font-weight:600;'>Meu Perfil</span> após o primeiro login"),
    ]
    corpo = (
        _hero("🤝", "Você foi convidado!", f"<span style='color:#D0D8E4;font-weight:600;'>{nome_convidador}</span> adicionou você como membro da equipe no BriqueOS Business.", "rgba(168,85,247,0.08)")
        + _plan_card("Business 🏢", "#A855F7", "Plano ativo na sua conta", "Todos os recursos<br/>premium liberados")
        + _spacer(12)
        + _senha_box(senha_temp)
        + _features(features, "rgba(168,85,247,0.12)", "#A855F7")
        + _spacer(16)
        + _cta("Acessar o BriqueOS", f"{BASE_URL}/login.html", "linear-gradient(135deg,#A855F7,#7C3AED)")
    )
    html = _base("linear-gradient(90deg,#A855F7,#4D9EFF)", "rgba(168,85,247,0.08)", corpo)
    return await _send(to, f"🤝 {nome_convidador} te convidou para o BriqueOS!", html)


# ─── NOVOS TEMPLATES ──────────────────────────────────────────────────

async def email_reset_senha(to: str, nome: str, token: str) -> bool:
    """Email com link para redefinição de senha."""
    p         = nome.split()[0]
    reset_url = f"{BASE_URL}/login.html?reset_token={token}"

    corpo = (
        _hero("🔐", f"Redefinir senha, {p}", "Recebemos uma solicitação para redefinir a senha da sua conta BriqueOS.", "rgba(77,158,255,0.08)")
        + f"""
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr><td style="padding:0 32px 28px;">
            <table width="100%" cellpadding="0" cellspacing="0" style="background:rgba(77,158,255,0.07);border:1px solid rgba(77,158,255,0.18);border-radius:14px;padding:24px;text-align:center;">
              <tr><td>
                <div style="font-family:'DM Sans',sans-serif;font-size:13px;color:#8A9BB0;line-height:1.7;margin-bottom:16px;">
                  Clique no botão abaixo para criar uma nova senha.<br/>
                  Este link expira em <strong style="color:#4D9EFF;">1 hora</strong>.
                </div>
                <a href="{reset_url}" style="display:inline-block;background:linear-gradient(135deg,#4D9EFF,#2563EB);color:#fff;font-family:'Syne',sans-serif;font-size:14px;font-weight:700;padding:14px 36px;border-radius:12px;text-decoration:none;">
                  Redefinir minha senha &rarr;
                </a>
                <div style="font-family:'DM Sans',sans-serif;font-size:11px;color:#3D4A5C;margin-top:16px;">
                  Se você não solicitou isso, pode ignorar este email com segurança.
                </div>
              </td></tr>
            </table>
          </td></tr>
        </table>
        """
        + f"""
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr><td style="padding:0 32px 32px;">
            <div style="font-family:'DM Sans',sans-serif;font-size:11px;color:#3D4A5C;word-break:break-all;text-align:center;">
              Ou copie o link: <span style="color:#4D9EFF;">{reset_url}</span>
            </div>
          </td></tr>
        </table>
        """
    )
    html = _base("linear-gradient(90deg,#4D9EFF,#2563EB)", "rgba(77,158,255,0.06)", corpo,
                 "Você recebeu este email porque solicitou redefinição de senha.")
    return await _send(to, "🔐 Redefinir senha — BriqueOS", html)


async def email_verificacao_cadastro(to: str, nome: str, token: str) -> bool:
    """Email de verificação de endereço após cadastro."""
    p         = nome.split()[0]
    verify_url = f"{BASE_URL}/login.html?verify_token={token}"

    corpo = (
        _hero("✉️", f"Confirme seu e-mail, {p}!", "Quase lá! Confirme seu endereço para garantir o acesso completo à sua conta.", "rgba(0,212,138,0.08)")
        + f"""
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr><td style="padding:0 32px 32px;text-align:center;">
            <a href="{verify_url}" style="display:inline-block;background:linear-gradient(135deg,#00D48A,#00B876);color:#fff;font-family:'Syne',sans-serif;font-size:14px;font-weight:700;padding:15px 40px;border-radius:12px;text-decoration:none;">
              Confirmar meu e-mail &rarr;
            </a>
            <div style="font-family:'DM Sans',sans-serif;font-size:11px;color:#3D4A5C;margin-top:16px;">
              Se o botão não funcionar, acesse:<br/>
              <span style="color:#00D48A;">{verify_url}</span>
            </div>
          </td></tr>
        </table>
        """
    )
    html = _base("linear-gradient(90deg,#00D48A,#4D9EFF)", "rgba(0,212,138,0.06)", corpo)
    return await _send(to, "✉️ Confirme seu e-mail — BriqueOS", html)


async def email_resumo_semanal(to: str, nome: str, dados: dict) -> bool:
    """Resumo semanal de desempenho enviado todo domingo."""
    p              = nome.split()[0]
    lucro_semana   = dados.get("lucro_semana", 0)
    vendas_semana  = dados.get("vendas_semana", 0)
    lucro_total    = dados.get("lucro_total", 0)
    estoque        = dados.get("compras_estoque", 0)
    nivel_nome     = dados.get("nivel_nome", "Iniciante")
    nivel_emoji    = dados.get("nivel_emoji", "🥉")

    def fmt(v: float) -> str:
        return f"R$ {v:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")

    cor_lucro = "#00D48A" if lucro_semana >= 0 else "#FF4D6A"
    sinal     = "+" if lucro_semana >= 0 else ""

    corpo = (
        _hero("📊", f"Sua semana, {p}!", "Confira como foi seu desempenho nos últimos 7 dias.", "rgba(255,107,43,0.06)")
        + f"""
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr><td style="padding:0 32px 24px;">
            <table width="100%" cellpadding="0" cellspacing="0" style="border-radius:14px;overflow:hidden;">
              <!-- Lucro da semana destaque -->
              <tr>
                <td style="background:linear-gradient(135deg,rgba(0,212,138,0.12),rgba(0,212,138,0.04));border:1px solid rgba(0,212,138,0.2);border-radius:14px;padding:24px;text-align:center;margin-bottom:12px;">
                  <div style="font-family:'DM Sans',sans-serif;font-size:10px;font-weight:600;color:#00D48A;text-transform:uppercase;letter-spacing:1.2px;margin-bottom:8px;">Lucro desta semana</div>
                  <div style="font-family:'Syne',sans-serif;font-size:36px;font-weight:900;color:{cor_lucro};letter-spacing:-1px;">{sinal}{fmt(lucro_semana)}</div>
                  <div style="font-family:'DM Sans',sans-serif;font-size:12px;color:#6B7A90;margin-top:6px;">{vendas_semana} venda(s) realizada(s)</div>
                </td>
              </tr>
            </table>
          </td></tr>
        </table>
        """
        + _info_rows(
            ("Lucro total acumulado", fmt(lucro_total), "#F0F4FA"),
            ("Itens em estoque",     str(estoque),       "#F0F4FA"),
            ("Seu nível atual",      f"{nivel_emoji} {nivel_nome}", "#FFB800"),
        )
        + f"""
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr><td style="padding:0 32px 16px;">
            <table width="100%" cellpadding="0" cellspacing="0" style="background:rgba(255,107,43,0.06);border:1px solid rgba(255,107,43,0.15);border-radius:14px;padding:16px 20px;">
              <tr><td style="font-family:'DM Sans',sans-serif;font-size:13px;color:#8A9BB0;line-height:1.7;">
                {"🎉 <strong style='color:#F0F4FA;'>Ótima semana!</strong> Continue assim para subir de nível e desbloquear mais recompensas." if lucro_semana > 0 else
                 "💪 <strong style='color:#F0F4FA;'>Nenhuma venda esta semana.</strong> Que tal listar seus itens parados no estoque?"}
              </td></tr>
            </table>
          </td></tr>
        </table>
        """
        + _spacer(8)
        + _cta("Ver meu painel", BASE_URL, "linear-gradient(135deg,#FF6B2B,#FF3D00)")
    )

    html = _base("linear-gradient(90deg,#FF6B2B,#FFB800)", "rgba(255,107,43,0.06)", corpo,
                 "Resumo semanal automático — BriqueOS")
    return await _send(to, f"📊 Sua semana no BriqueOS — {fmt(lucro_semana)} de lucro", html)