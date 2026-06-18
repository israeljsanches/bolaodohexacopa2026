const http = require("http");
const fs = require("fs");
const path = require("path");
const url = require("url");
const { MongoClient } = require("mongodb");

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, "public");

const client = new MongoClient(process.env.MONGO_URI, {
    serverSelectionTimeoutMS: 20000,
    tlsAllowInvalidCertificates: true,
    tlsAllowInvalidHostnames: true
});

let db;

async function start() {
    try {
        await client.connect();
        db = client.db("bolao_database");
        console.log("Conectado ao MongoDB (SSL ignorado)!");
        server.listen(PORT, "0.0.0.0", () => console.log(`Servidor rodando na porta ${PORT}`));
    } catch (err) { console.error("ERRO FATAL NA CONEXÃO:", err); }
}

const server = http.createServer(async (req, res) => {
    const p = url.parse(req.url, true);
    
    // Rota de saúde para o Render
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
                    // AJUSTE: Verifica se é uma lista vazia para zerar ou um objeto para inserir
                    if (Array.isArray(data) && data.length === 0) {
                        await db.collection("apostas").deleteMany({});
                        res.writeHead(200, { "Content-Type": "application/json" });
                        res.end(JSON.stringify({ status: "cleared" }));
                    } else {
                        await db.collection("apostas").insertOne(data);
                        res.writeHead(200, { "Content-Type": "application/json" });
                        res.end(JSON.stringify({ status: "success" }));
                    }
                }
                else if (p.pathname === "/api/excluir-aposta") {
                    await db.collection("apostas").deleteOne({ cpf: data.cpf });
                    res.writeHead(200);
                    res.end(JSON.stringify({ ok: true }));
                } 
                else if (p.pathname === "/api/gabarito") {
                    await db.collection("gabarito").updateOne({ _id: "atual" }, { $set: { conteudo: data } }, { upsert: true });
                    res.writeHead(200);
                    res.end(JSON.stringify({ ok: true }));
                } 
                else if (p.pathname === "/api/processar") {
    const apostas = await db.collection("apostas").find().toArray();
    const gabaritoDoc = await db.collection("gabarito").findOne({ _id: "atual" });
    
    if (gabaritoDoc && gabaritoDoc.conteudo) {
        const gabarito = gabaritoDoc.conteudo;
        for (let aposta of apostas) {
            let totalPontos = 0;
            let exatos = 0;
            let acertosVencedor = 0; // "Vencedores" (acerto do sinal: casa, fora ou empate)

            if (aposta.palpites) {
                for (let matchId in aposta.palpites) {
                    if (gabarito[matchId]) {
                        const p = aposta.palpites[matchId];
                        const r = gabarito[matchId];
                        const pA = Number(p.goalsA), pB = Number(p.goalsB);
                        const rA = Number(r.realA), rB = Number(r.realB);
                        
                        // Lógica de pontuação mantida
                        if (pA === rA && pB === rB) {
                            totalPontos += 5;
                            exatos += 1;
                        } else if ((pA > pB && rA > rB) || (pA < pB && rA < rB) || (pA === pB && rA === rB)) {
                            totalPontos += 2;
                            acertosVencedor += 1;
                        }
                    }
                }
            }
            // Atualiza os registros com os novos critérios
            await db.collection("apostas").updateOne(
                { _id: aposta._id }, 
                { $set: { pontos: totalPontos, exatos: exatos, acertosVencedor: acertosVencedor } }
            );
        }
    }
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
}
            } catch (err) { 
                console.error("Erro no servidor:", err);
                res.writeHead(500); 
                res.end(JSON.stringify({ error: err.message })); 
            }
        });
    }
});
start();
