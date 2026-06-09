const CF_ZONE_ID = process.env.CF_ZONE_ID;
const CF_API_TOKEN = process.env.CF_API_TOKEN;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const IS_FIRST_RUN = process.env.IS_FIRST_RUN === 'true'; // Bandera que le pasará GitHub

async function checkCloudflare() {
  const cincoMinutosAtras = new Date(Date.now() - 5 * 60 * 1000).toISOString();

  // Traer todos los estatus (sin filtrar por error en la query)
  const query = {
    query: `query {
      viewer {
        zones(filter: { zoneTag: "${CF_ZONE_ID}" }) {
          httpRequestsAdaptiveGroups(
            limit: 100
            filter: {
              datetime_geq: "${cincoMinutosAtras}"
            }
          ) {
            count
            dimensions {
              edgeResponseStatus
            }
          }
        }
      }
    }`
  };

  try {
    const response = await fetch('https://api.cloudflare.com/client/v4/graphql', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${CF_API_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(query)
    });

    const resData = await response.json();
    const groups = resData.data?.viewer?.zones[0]?.httpRequestsAdaptiveGroups || [];

    let totalErroresCriticos = 0;
    let resumenGeneral = '';
    let desgloseErrores = '';

    groups.forEach(group => {
      const status = group.dimensions.edgeResponseStatus;
      const count = group.count;

      // Alimenta el resumen general para la primera corrida
      resumenGeneral += `• *Status ${status}:* ${count} peticiones\n`;

      // Cuenta sólo errores de servidor (500 para arriba)
      if (status >= 500) {
        totalErroresCriticos += count;
        desgloseErrores += `• *Status ${status}:* ${count} peticiones\n`;
      }
    });

    if (IS_FIRST_RUN) {
      // 🚀 PRIMERA CORRIDA: Reporte completo de salud del sitio
      const msg = `🚀 *MONITOR INICIALIZADO*\n\nEste es el estado actual de tus peticiones en los últimos 5 min:\n\n${resumenGeneral || '• Sin tráfico registrado.'}\n_A partir de ahora, solo avisaré si hay errores ≥ 500._`;
      await sendTelegramAlert(msg);
      console.log("Primer reporte enviado a Telegram.");
    } else if (totalErroresCriticos > 0) {
      // 🚨 CORRIDAS SUBSECUENTES: Solo alerta si hay broncas reales en el backend
      const msg = `⚠️ *ALERTA DE INFRAESTRUCTURA*\n\nSe detectaron *${totalErroresCriticos}* errores de servidor (≥ 500) en el sitemap.\n\n*Detalle del fallo:*\n${desgloseErrores}\n📍 _Host: capitalmexico.com.mx_`;
      await sendTelegramAlert(msg);
      console.log(`Alerta de error enviada. Conteo de fallos: ${totalErroresCriticos}`);
    } else {
      console.log(`Monitoreo rutinario limpio. Errores críticos: ${totalErroresCriticos}`);
    }

  } catch (error) {
    console.error('Fallo en la ejecución del monitor:', error);
  }
}

async function sendTelegramAlert(mensaje) {
  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
  await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      'chat_id': TELEGRAM_CHAT_ID,
      'text': mensaje,
      'parse_mode': 'Markdown'
    })
  });
}

checkCloudflare();
