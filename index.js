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

            const videoMessage =
                msg.message.videoMessage ||
                msg.message.viewOnceMessageV2?.message?.videoMessage;

            if (!imageMessage && !videoMessage) continue;

            const jid = msg.key.remoteJid;
            const MAX_VIDEO_SECONDS = 6;
            const MAX_STICKER_BYTES = 500 * 1024;

            if (videoMessage?.seconds > MAX_VIDEO_SECONDS) {
                await sock.sendMessage(jid, {
                    text: `Video muito longo pra virar figurinha (max ${MAX_VIDEO_SECONDS}s). Manda um video mais curto.`,
                });
                continue;
            }

            try {
                if (videoMessage) {
                    await sock.sendMessage(jid, { text: "Processando video, pode demorar um pouco..." });
                }

                const buffer = await downloadMediaMessage(msg, "buffer", {});

                const qualitySteps = videoMessage ? [70, 50, 30, 15] : [70];

                let stickerBuffer;
                for (const quality of qualitySteps) {
                    const sticker = new Sticker(buffer, {
                        pack: "Figurinhas",
                        author: "Bot",
                        type: StickerTypes.CROPPED,
                        quality,
                    });

                    stickerBuffer = await sticker.toBuffer();

                    if (stickerBuffer.length <= MAX_STICKER_BYTES) break;
                }

                if (stickerBuffer.length > MAX_STICKER_BYTES) {
                    await sock.sendMessage(jid, {
                        text: "Figurinha ficou maior que o limite do WhatsApp (500KB) mesmo com qualidade reduzida. Manda um video mais curto ou mais simples.",
                    });
                    continue;
                }

                await sock.sendMessage(jid, { sticker: stickerBuffer });
            } catch (err) {
                console.error("Erro ao gerar figurinha:", err);
                await sock.sendMessage(jid, { text: "Nao consegui transformar isso em figurinha." });
            }
        }
    });
};

startBot();
