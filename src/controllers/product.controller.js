import mongoose from "mongoose";
import { Product } from "../models/product.model.js";
import { storeLocalFile } from "../utils/localStorage.js";

const createProduct = async (req, res) => {
  try {
    const {
      name,
      skuId,
      description,
      category,
      status,
      price,
      discountPrice,
      stock,
      weight,
      dimensionLength,
      dimensionWidth,
      dimensionHeight,
      dimensionUnit,
      taxrate,
    } = req.body;

    if (!name || !skuId || !price || !stock) {
      return res.status(400).json({ success: false, message: "Please fill all required fields." });
    }

    const formattedPrice = Number(price);
    const formattedDiscount = discountPrice ? Number(discountPrice) : 0;
    const formattedStock = Number(stock);
    const formattedWeight = Number(weight);

    if (Number.isNaN(formattedPrice) || Number.isNaN(formattedStock)) {
      return res.status(400).json({ success: false, message: "Price, stock, and weight must be valid numbers." });
    }

    if (formattedDiscount > formattedPrice) {
      return res.status(400).json({ success: false, message: "Discount price cannot be greater than original price." });
    }

    const mainImageFile = req.files?.mainImage?.[0];
    const additionalImageFiles = req.files?.additionalImages || [];

    if (!mainImageFile) {
      return res.status(400).json({ success: false, message: "Main image is required." });
    }

    if (additionalImageFiles.length > 5) {
      return res.status(400).json({ success: false, message: "Only up to 5 additional images are allowed." });
    }

    const uploadedMainImage = await storeLocalFile(mainImageFile.path, {
      category: "documents",
      fileName: mainImageFile.originalname,
    });

    const uploadedAdditionalImages = [];
    for (const file of additionalImageFiles) {
      const result = await storeLocalFile(file.path, {
        category: "documents",
        fileName: file.originalname,
      });

      uploadedAdditionalImages.push({
        url: result.secure_url,
        public_id: result.public_id,
      });
    }

    const newProduct = new Product({
      name,
      skuId: skuId.toUpperCase(),
      description,
      category,
      status,
      price: formattedPrice,
      discountPrice: formattedDiscount,
      stock: formattedStock,
      weight: formattedWeight,
      dimensions: {
        length: Number(dimensionLength),
        width: Number(dimensionWidth),
        height: Number(dimensionHeight),
        unit: dimensionUnit || "cm",
      },
      mainImage: {
        url: uploadedMainImage.secure_url,
        public_id: uploadedMainImage.public_id,
      },
      additionalImages: uploadedAdditionalImages,
      createdBy: req.user.role === "staff" ? req.user.parentUser._id : req.user._id,
      tenantId: req.user.tenantId._id,
      taxrate,
    });

    const savedProduct = await newProduct.save();

    res.status(201).json({
      success: true,
      message: "Product created successfully",
      data: savedProduct,
    });
  } catch (error) {
    console.error("Error while creating product:", error);
    res.status(500).json({
      success: false,
      message: "Server error while creating product",
    });
  }
};

const getAllProducts = async (req, res) => {
  try {
    const tenantId = req.user.tenantId._id;
    const isAdmin = req.user.role === "admin";

    const products = await Product.find(
      isAdmin
        ? { tenantId }
        : { tenantId, status: "Active" }
    ).sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      message: "Products fetched successfully",
      data: products,
    });
  } catch (error) {
    console.error("Error while fetching products:", error);
    res.status(500).json({
      success: false,
      message: "Server error while fetching products",
    });
  }
};

const updateProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.role === "staff" ? req.user.parentUser._id : req.user._id;
    const tenantId = req.user.tenantId._id;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid product ID.",
      });
    }

    const {
      name,
      skuId,
      category,
      price,
      status,
      discountPrice,
      stock,
    } = req.body;

    if (!name || !skuId || Number.isNaN(Number(price)) || Number.isNaN(Number(stock))) {
      return res.status(400).json({
        success: false,
        message: "Invalid input. Please provide name, SKU, price, and stock.",
      });
    }

    const formattedPrice = Number(price);
    const formattedStock = Number(stock);
    const formattedDiscountPrice = discountPrice ? Number(discountPrice) : 0;

    if (formattedDiscountPrice > formattedPrice) {
      return res.status(400).json({
        success: false,
        message: "Discount price cannot be greater than the original price.",
      });
    }

    const updatedProduct = await Product.findOneAndUpdate(
      { _id: id, createdBy: userId, tenantId },
      {
        name,
        skuId: skuId.toUpperCase(),
        category,
        status,
        price: formattedPrice,
        stock: formattedStock,
        discountPrice: formattedDiscountPrice,
        updatedAt: new Date(),
      },
      { new: true }
    );

    if (!updatedProduct) {
      return res.status(404).json({
        success: false,
        message: "Product not found or not authorized.",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Product updated successfully",
      data: updatedProduct,
    });
  } catch (error) {
    console.error("Update error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while updating product",
    });
  }
};

const getLatestProduct = async (req, res) => {
  try {
    const tenantId = req.user.tenantId._id;

    const latestProduct = await Product.findOne({
      tenantId,
      status: "Active",
      stock: { $gt: 0 },
    }).sort({ createdAt: -1 });

    if (!latestProduct) {
      return res.status(404).json({
        success: false,
        message: "No product found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Latest product fetched successfully",
      data: latestProduct,
    });
  } catch (error) {
    console.error("Error while fetching latest product:", error);
    res.status(500).json({
      success: false,
      message: "Server error while fetching latest product",
    });
  }
};

const getProductById = async (req, res) => {
  try {
    const tenantId = req.user.tenantId._id;
    const productId = req.params.id;

    if (!productId) {
      return res.status(400).json({
        success: false,
        message: "Product ID is required",
      });
    }

    const product = await Product.findOne({
      _id: productId,
      tenantId,
    });

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Product fetched successfully",
      data: product,
    });
  } catch (error) {
    console.error("Error while fetching product by ID:", error);
    res.status(500).json({
      success: false,
      message: "Server error while fetching product by ID",
    });
  }
};

export {
  createProduct,
  getAllProducts,
  updateProduct,
  getLatestProduct,
  getProductById,
};
