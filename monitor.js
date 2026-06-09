const CF_ZONE_ID = process.env.CF_ZONE_ID;
const CF_API_TOKEN = process.env.CF_API_TOKEN;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

const UMBRAL_ERRORES = 50; // Alerta si hay más de 50 errores

async function checkCloudflare() {
  // Calcular tiempo de los últimos 5 minutos en formato ISO UTC
  const cincoMinutosAtras = new Date(Date.now() - 5 * 60 * 1000).toISOString();

  const query = {
    query: `query {
      viewer {
        zones(filter: { zoneTag: "${CF_ZONE_ID}" }) {
          httpRequestsAdaptiveGroups(
            limit: 100
            filter: {
              datetime_geq: "${cincoMinutosAtras}"
              edgeResponseStatus_in: [500, 522]
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

    let totalErrores = 0;
    let desglose = '';

    groups.forEach(group => {
      const status = group.dimensions.edgeResponseStatus;
      const count = group.count;
      totalErrores += count;
      desglose += `• *Error ${status}:* ${count} peticiones\n`;
    });

    if (totalErrores > UMBRAL_ERRORES) {
      await sendTelegramAlert(totalErrores, desglose);
    } else {
      console.log(`Todo en orden. Errores detectados: ${totalErrores}`);
    }

  } catch (error) {
    console.error('Error al consultar la API de Cloudflare:', error);
  }
}

async function sendTelegramAlert(total, detalle) {
  const mensaje = `⚠️ *ALERTA DESDE GITHUB ACTIONS*\n\n` +
                  `Se detectaron *${total}* errores críticos en los últimos 5 minutos.\n\n` +
                  `*Desglose:*\n${detalle}\n` +
                  `📍 _Host: capitalmexico.com.mx_`;

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
