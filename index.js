import {
    useMultiFileAuthState,
    makeWASocket,
    downloadMediaMessage,
    DisconnectReason,
} from "@whiskeysockets/baileys";
import qr from "qrcode-terminal";
import { Sticker, StickerTypes } from "wa-sticker-formatter";

const startBot = async () => {
    const { state, saveCreds } = await useMultiFileAuthState("auth_info");

    const sock = makeWASocket({
        auth: state,
    });

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("connection.update", (update) => {
        const { connection, lastDisconnect, qr: qrCode } = update;

        if (qrCode) {
            qr.generate(qrCode, { small: true });
        }

        if (connection === "close") {
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
            console.log("Conexao encerrada. statusCode:", statusCode, shouldReconnect ? "Reconectando..." : "Deslogado.");
            console.error(lastDisconnect?.error);
            if (shouldReconnect) startBot();
        } else if (connection === "open") {
            console.log("Bot conectado ao WhatsApp.");
        }
    });

    sock.ev.on("messages.upsert", async ({ messages, type }) => {
        if (type !== "notify") return;

        for (const msg of messages) {
            if (!msg.message) continue;

            const imageMessage =
                msg.message.imageMessage ||
                msg.message.viewOnceMessageV2?.message?.imageMessage;

            if (!imageMessage) continue;

            const jid = msg.key.remoteJid;

            try {
                const buffer = await downloadMediaMessage(msg, "buffer", {});

                const sticker = new Sticker(buffer, {
                    pack: "Figurinhas",
                    author: "Bot",
                    type: StickerTypes.FULL,
                    quality: 70,
                });

                const stickerBuffer = await sticker.toBuffer();

                await sock.sendMessage(jid, { sticker: stickerBuffer });
            } catch (err) {
                console.error("Erro ao gerar figurinha:", err);
                await sock.sendMessage(jid, { text: "Nao consegui transformar essa foto em figurinha." });
            }
        }
    });
};

startBot();
