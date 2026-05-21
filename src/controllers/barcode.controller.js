import bwipjs from "bwip-js";

const barcodegeneratecontroller = async (req, res) => {
    const { number } = req.body;
    const { nonumber } = req.query;

    if (!number) {
        return res.status(400).json({ success: false, message: "Number is required to generate barcode." });
    }

    try {
        const barcodeBuffer = await bwipjs.toBuffer({
            bcid: "code128",
            text: String(number),
            scale: 3,
            height: 18,
            includetext: !nonumber,
            textxalign: "center",
            backgroundcolor: "FFFFFF",
        });

        const barcodeImage = `data:image/png;base64,${barcodeBuffer.toString("base64")}`;

        return res.status(200).json({
            success: true,
            barcode: barcodeImage,
        });
    } catch (error) {
        console.error("Error generating barcode:", error);
        return res.status(500).json({ success: false, message: "Failed to generate barcode." });
    }
};

export { barcodegeneratecontroller };
