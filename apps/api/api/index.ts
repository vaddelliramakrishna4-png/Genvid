export default async function(req: Request) {
  return new Response(JSON.stringify({
    message: "Hello from raw Vercel Web Request handler!",
    url: req.url,
    method: req.method
  }), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
}
