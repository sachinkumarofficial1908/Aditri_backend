const fs = require('fs');
const {
  validateWorkbookHeaders,
  createWageSlipWorkbook,
} = require('../services/wageSlipService');

const cleanup = (filePath) => {
  if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath);
};

const validateWageFile = async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: "Excel file is required" });

    const result = await validateWorkbookHeaders(req.file.path);
    cleanup(req.file.path);

    return res.json({
      success: true,
      missingHeaders: result.missingHeaders,
      foundHeaders: result.foundHeaders,
      canContinue: true,
    });
  } catch (error) {
    cleanup(req.file?.path);
    next(error);
  }
};

const generateWageSlips = async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: "Excel file is required" });

    const { month, year, allowMissingHeaders } = req.body;
    if (!month || !year) {
      cleanup(req.file.path);
      return res.status(400).json({ success: false, message: "Month and year are required" });
    }

    const output = await createWageSlipWorkbook({
      inputPath: req.file.path,
      month,
      year,
      allowMissingHeaders: allowMissingHeaders === "true" || allowMissingHeaders === true,
    });

    cleanup(req.file.path);

    res.download(output.filePath, output.fileName, (err) => {
      if (fs.existsSync(output.filePath)) fs.unlinkSync(output.filePath);
      if (err) console.error("Download error:", err);
    });
  } catch (error) {
    cleanup(req.file?.path);
    next(error);
  }
};

module.exports = {
  validateWageFile,
  generateWageSlips,
};
