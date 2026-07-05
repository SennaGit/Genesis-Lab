let buffer = Buffer.alloc(0);

process.stdin.on("data", (chunk) => {
  buffer = Buffer.concat([buffer, chunk]);
  while (true) {
    const message = readMessage();
    if (!message) {
      return;
    }
    handleMessage(message);
  }
});

function readMessage() {
  const headerEnd = buffer.indexOf("\r\n\r\n");
  if (headerEnd < 0) {
    return undefined;
  }
  const header = buffer.subarray(0, headerEnd).toString("utf8");
  const length = Number(/Content-Length:\s*(\d+)/i.exec(header)?.[1] ?? 0);
  const bodyStart = headerEnd + 4;
  if (buffer.length < bodyStart + length) {
    return undefined;
  }
  const body = buffer.subarray(bodyStart, bodyStart + length).toString("utf8");
  buffer = buffer.subarray(bodyStart + length);
  return JSON.parse(body);
}

function handleMessage(message) {
  if (!message.id) {
    return;
  }
  if (message.method === "initialize") {
    send({
      jsonrpc: "2.0",
      id: message.id,
      result: {
        protocolVersion: "2024-11-05",
        capabilities: { tools: {} },
        serverInfo: { name: "genesis-test-mcp", version: "0.1.0" }
      }
    });
    return;
  }
  if (message.method === "tools/call") {
    send({
      jsonrpc: "2.0",
      id: message.id,
      result: {
        content: [{ type: "text", text: `echo:${message.params.arguments.text}` }],
        structuredContent: { echoed: message.params.arguments.text, tool: message.params.name }
      }
    });
    return;
  }
  send({ jsonrpc: "2.0", id: message.id, error: { code: -32601, message: `Unknown method ${message.method}` } });
}

function send(message) {
  const body = JSON.stringify(message);
  process.stdout.write(`Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`);
}
