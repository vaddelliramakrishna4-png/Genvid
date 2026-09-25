import { handle } from 'hono/vercel';

export default async function(req: Request) {
  try {
    const { default: app } = await import('../src/index');
    const handler = handle(app as any);
    return await handler(req);
  } catch (e: any) {
    return new Response(JSON.stringify({ 
      error: "FATAL_INIT_ERROR", 
      message: e?.message,
      stack: e?.stack 
    }), { 
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}
