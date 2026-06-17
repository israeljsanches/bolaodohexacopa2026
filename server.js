const http = require("http");
const fs = require("fs");
const path = require("path");
const url = require("url");
const { MongoClient } = require("mongodb");

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, "public");

// Adicionamos a opção de timeout para evitar travamentos
const client = new MongoClient(process.env.MONGO_URI, {
    serverSelectionTimeoutMS: 10000 
});

let db;

async function start() {
    try {
        await client.connect();
        db = client.db("bolao_database");
        console.log("Conectado ao MongoDB com sucesso!");
        
        server.listen(PORT, "0.0.0.0", () => {
            console.log(`Servidor rodando na porta ${PORT}`);
        });
    } catch (err) { 
        console.error("ERRO FATAL NA CONEXÃO:", err);
        process.exit(1); // Encerra o processo se não conectar
    }
}

const server = http.createServer(async (req, res) => {
    const p = url.parse(req.url, true);

    // Rota simples para o Render verificar se o app está vivo
    if (req.method === "GET" && p.pathname === "/health") {
        res.writeHead(200);
        return res.end("OK");
    }

    if (req.method === "GET") {
        if (p.pathname === "/api/visitas") {
            const data = await db.collection("apostas").find().toArray();
            res.writeHead(200, { "Content-Type": "application/json" });
            return res.end(JSON.stringify(data));
        }
        // ... (resto das rotas GET iguais)
        let filePath = path.join(PUBLIC_DIR, p.pathname === "/" ? "index.html" : p.pathname);
        fs.readFile(filePath, (err, content) => {
            if (err) { res.writeHead(404); res.end(); }
            else { res.writeHead(200); res.end(content); }
        });
        return;
    }

    if (req.method === "POST") {
        let body = "";
        req.on("data", chunk => body += chunk);
        req.on("end", async () => {
            try {
                let data = body ? JSON.parse(body) : {};
                // ... (mantenha sua lógica de POST aqui)
                res.writeHead(200, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ ok: true }));
            } catch (err) {
                res.writeHead(400);
                res.end(JSON.stringify({ error: "Erro" }));
            }
        });
    }
});

start();
