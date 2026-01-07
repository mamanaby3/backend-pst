import twilio from "twilio";

const accountSid = process.env.TWILIO_ACCOUNT_SID!;
const authToken = process.env.TWILIO_AUTH_TOKEN!;
const fromPhone ="+1 314 314 8257"

const client = twilio(accountSid, authToken);

/**
 * Envoie un SMS
 * @param to Numéro du destinataire (format international, ex: +221771234567)
 * @param message Contenu du SMS
 */
export async function sendSms(to: string, message: string) {
    if (!to) {
        throw new Error("Numéro de téléphone manquant");
    }

    console.log("📨 Envoi SMS vers:", to);

    return client.messages.create({
        body: message,
        from: fromPhone,
        to
    });
}
