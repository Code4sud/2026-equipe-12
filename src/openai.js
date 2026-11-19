// Appel à l'API OpenAI (Chat Completions) avec sortie JSON imposée par un schéma.
// Utilisé par le MJ (src/mj.js) et l'analyse de récit (src/analyse.js).
//
// Pas de SDK : un simple fetch, compatible Cloudflare Workers. Le client a la même
// forme que celui du SDK officiel (client.chat.completions.create(params, { signal })),
// ce qui permet aux tests d'injecter un faux client.

/** Le modèle le moins cher d'OpenAI (0,05 $ / 0,40 $ par million de tokens, nov. 2026). */
export const MODELE = "gpt-5-nano";
const URL_API = "https://api.openai.com/v1/chat/completions";

export function creerClient(apiKey) {
  return {
    chat: {
      completions: {
        async create(params, { signal } = {}) {
          const reponse = await fetch(URL_API, {
            method: "POST",
            headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
            body: JSON.stringify(params),
            signal,
          });
          if (!reponse.ok) {
            let detail = "";
            try {
              detail = (await reponse.json())?.error?.message ?? "";
            } catch {
              /* corps illisible */
            }
            throw new Error(`OpenAI ${reponse.status}${detail ? ` : ${detail}` : ""}`);
          }
          return reponse.json();
        },
      },
    },
  };
}

/**
 * Un appel, une sortie JSON conforme au schéma (mode strict d'OpenAI).
 * Lève une erreur sur refus, réponse tronquée, JSON illisible ou dépassement du délai :
 * l'appelant bascule alors sur le MJ de secours.
 * @returns {Promise<{ brut: any, modele: string }>}
 */
export async function appelerJSON({ client, modele = MODELE, system, contenu, schema, nom, effort = "low", maxTokens = 8000, timeoutMs }) {
  const ctrl = new AbortController();
  const minuterie = setTimeout(() => ctrl.abort(), timeoutMs);
  let response;
  try {
    response = await client.chat.completions.create(
      {
        model: modele,
        reasoning_effort: effort,
        max_completion_tokens: maxTokens,
        response_format: { type: "json_schema", json_schema: { name: nom, strict: true, schema } },
        messages: [
          { role: "developer", content: system },
          { role: "user", content: contenu },
        ],
      },
      { signal: ctrl.signal },
    );
  } finally {
    clearTimeout(minuterie);
  }
  const choix = response?.choices?.[0];
  if (choix?.message?.refusal) throw new Error("refus du modèle");
  if (choix?.finish_reason === "length") throw new Error("réponse tronquée");
  return { brut: JSON.parse(choix?.message?.content ?? ""), modele: response?.model ?? modele };
}
