const http = require("http");
const fs = require("fs");
const path = require("path");
const url = require("url");
const { MongoClient } = require("mongodb");

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, "public");

// Configuração forçada para ignorar erros de TLS/SSL que o Atlas possa estar rejeitando
const client = new MongoClient(process.env.MONGO_URI, {
    serverSelectionTimeoutMS: 20000,
    // Remova o 'tls: true' daqui, deixe o driver decidir a conexão baseada na URI
    tlsAllowInvalidCertificates: true,
    tlsAllowInvalidHostnames: true
});

let db;

async function start() {
    try {
        await client.connect();
        db = client.db("bolao_database");
        console.log("Conectado ao MongoDB (SSL ignorado)!");
        
        server.listen(PORT, "0.0.0.0", () => {
            console.log(`Servidor rodando na porta ${PORT}`);
        });
    } catch (err) { 
        console.error("ERRO FATAL NA CONEXÃO:", err);
    }
}

const server = http.createServer(async (req, res) => {
    const p = url.parse(req.url, true);

    // Rota de saúde para o Render verificar se o servidor está ativo
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
        if (p.pathname === "/api/gabarito") {
            const data = await db.collection("gabarito").findOne({ _id: "atual" });
            res.writeHead(200, { "Content-Type": "application/json" });
            return res.end(JSON.stringify(data ? data.conteudo : {}));
        }
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
                
                if (p.pathname === "/api/visitas") {
                    await db.collection("apostas").deleteMany({});
                    if (data.length > 0) await db.collection("apostas").insertMany(data);
                } else if (p.pathname === "/api/excluir-aposta") {
                    await db.collection("apostas").deleteOne({ cpf: data.cpf });
                } else if (p.pathname === "/api/gabarito") {
                    await db.collection("gabarito").updateOne({ _id: "atual" }, { $set: { conteudo: data } }, { upsert: true });
                } else if (p.pathname === "/api/processar") {
                    try {
                        const apostas = await db.collection("apostas").find().toArray();
                        const gabaritoDoc = await db.collection("gabarito").findOne({ _id: "atual" });
                        
                        if (gabaritoDoc && gabaritoDoc.conteudo) {
                            const gabarito = gabaritoDoc.conteudo;
                            for (let aposta of apostas) {
                                let totalPontos = 0;
                                if (aposta.palpites) {
                                    for (let matchId in aposta.palpites) {
                                        if (gabarito[matchId]) {
                                            const p = aposta.palpites[matchId];
                                            const r = gabarito[matchId];
                                            const pA = Number(p.goalsA), pB = Number(p.goalsB);
                                            const rA = Number(r.realA), rB = Number(r.realB);
                                            
                                            if (pA === rA && pB === rB) {
                                                totalPontos += 5;
                                            } else if ((pA > pB && rA > rB) || (pA < pB && rA < rB) || (pA === pB && rA === rB)) {
                                                totalPontos += 2;
                                            }
                                        }
                                    }
                                }
                                await db.collection("apostas").updateOne({ _id: aposta._id }, { $set: { pontos: totalPontos } });
                            }
                        }
                        res.writeHead(200, { "Content-Type": "application/json" });
                        res.end(JSON.stringify({ ok: true }));
                    } catch (err) {
                        console.error("Erro no processamento:", err);
                        res.writeHead(500);
                        res.end(JSON.stringify({ error: err.message }));
                    }
                }
            } catch (err) {
                res.writeHead(400);
                res.end(JSON.stringify({ error: "JSON inválido" }));
            }
        });
    }
});

start();
