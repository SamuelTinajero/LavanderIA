import { AIProjectClient } from '@azure/ai-projects';
import { DefaultAzureCredential, ManagedIdentityCredential } from '@azure/identity';
import { ejecutarHerramienta } from './tools.js';
import { respuestaSimulada } from './chat-simulado.js';

export function foundryConfigurado() {
  return Boolean(process.env.FOUNDRY_PROJECT_ENDPOINT && process.env.FOUNDRY_AGENT_NAME);
}

function extraerRespuesta(respuesta) {
  const partes = respuesta.output?.filter(item => item.type === 'message').flatMap(item => item.content || []) || [];
  const answer = respuesta.output_text || partes.filter(item => item.type === 'output_text').map(item => item.text).join('\n');
  const sources = [...new Set(partes.flatMap(item => item.annotations || []).map(a => a.url || a.filename || a.file_id || a.title).filter(Boolean))];
  return { answer: answer || 'No pude generar una respuesta.', sources };
}

export async function preguntar(mensaje, conversationId) {
  if (!foundryConfigurado()) return respuestaSimulada(mensaje, conversationId);
  const credencial = process.env.NODE_ENV === 'production' ? new ManagedIdentityCredential() : new DefaultAzureCredential();
  const proyecto = new AIProjectClient(process.env.FOUNDRY_PROJECT_ENDPOINT, credencial);
  const cliente = proyecto.getOpenAIClient();
  const id = conversationId || (await cliente.conversations.create()).id;
  const referencia = { name: process.env.FOUNDRY_AGENT_NAME, type: 'agent_reference' };
  let entrada = mensaje;
  for (let vuelta = 0; vuelta < 5; vuelta++) {
    const respuesta = await cliente.responses.create({ conversation: id, input: entrada }, { body: { agent_reference: referencia } });
    const llamadas = (respuesta.output || []).filter(item => item.type === 'function_call');
    if (!llamadas.length) return { ...extraerRespuesta(respuesta), conversationId: id, modo: 'foundry' };
    entrada = [];
    for (const llamada of llamadas) {
      let output;
      try { output = await ejecutarHerramienta(llamada.name, llamada.arguments); }
      catch (error) { output = JSON.stringify({ error: error.message }); }
      if (process.env.DEBUG_TOOLS) console.log('[herramienta]', llamada.name, llamada.arguments, '=>', String(output).slice(0, 200));
      entrada.push({ type: 'function_call_output', call_id: llamada.call_id, output });
    }
  }
  throw new Error('Demasiadas llamadas de herramientas');
}
