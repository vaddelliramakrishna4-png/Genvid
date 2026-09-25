import handler from "./api/index";

const mockReq = {
  method: "GET",
  url: "https://genvid-api.vercel.app/",
  headers: {
    host: "genvid-api.vercel.app"
  }
};

const mockRes = {
  statusCode: 200,
  setHeader: (k, v) => console.log("SetHeader:", k, v),
  end: (data) => console.log("End:", data),
  json: (data) => console.log("JSON:", data)
};

async function run() {
  try {
    process.env.VERCEL = "1";
    console.log("Invoking handler...");
    // Try invoking as Web Request (1 argument)
    if (handler.length === 1) {
       console.log("Handler expects 1 argument (Web Request API)");
       const req = new Request("https://genvid-api.vercel.app/");
       const res = await handler(req);
       console.log("Response status:", res.status);
       console.log("Response body:", await res.text());
    } else {
       console.log("Handler expects 2 arguments (req, res)");
       await handler(mockReq, mockRes);
    }
  } catch (e) {
    console.error("Crash during invocation!", e);
  }
}

run();
