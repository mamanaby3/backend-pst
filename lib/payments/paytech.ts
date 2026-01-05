export async function initPaytechPayment({
                                             amount,
                                             phone,
                                             provider,
                                             transaction_id,
                                             callback_url,
                                             success_url,
                                             cancel_url
                                         }: any) {

    const response = await fetch("https://paytech.sn/api/payment/request-payment", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "API_KEY": process.env.PAYTECH_API_KEY!,
            "API_SECRET": process.env.PAYTECH_API_SECRET!
        },
        body: JSON.stringify({
            amount,
            currency: "XOF",
            payment_method: provider, // Wave | Orange Money
            phone,
            ref_command: transaction_id,
            item_name: "Abonnement Chauffeur",
            success_url,
            cancel_url,
            ipn_url: callback_url
        })
    });

    return response.json();
}
