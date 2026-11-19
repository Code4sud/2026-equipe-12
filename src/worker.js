// Worker « Potentiel caché » : point d'entrée Cloudflare Workers.
// Amorce : sert les fichiers statiques de public/. L'API (/api/*) et les
// parties en temps réel (Durable Objects) arrivent dans les PR suivantes.
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) {
      return Response.json({ erreur: "API pas encore disponible." }, { status: 404 });
    }
    return env.ASSETS.fetch(request);
  },
};
