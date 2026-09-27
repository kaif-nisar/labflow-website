import { asyncHandler } from "../utils/asyncHandler.js";
import { queryGeminiCopilot } from "./gemini.service.js";
import {
  getScopeContext,
  executeCreateTest,
  executeCreatePanel,
  executeCreatePackage,
  executeCreateBooking,
  executeUpdateTest,
  executeUpdatePanel,
  executeUpdatePackage,
  repairPreviousCopilotBookings,
  auditTestsInDatabase,
  findMissingStandardTests,
  executeFixTest,
  executeBatchFixTests,
  searchLabCatalog
} from "./copilot.tools.js";
import { categorydb } from "../models/category.model.js";
import { testSchema } from "../models/newTest.model.js";
import { addPannel } from "../models/AddPannel.model.js";

/**
 * Chat with LabFlow AI Copilot
 */
export const chatWithCopilot = asyncHandler(async (req, res) => {
  const { message, history = [], currentProposal = null, images = [] } = req.body;

  if ((!message || typeof message !== "string") && (!Array.isArray(images) || images.length === 0)) {
    return res.status(400).json({
      success: false,
      message: "Please enter a message or attach an image for AI Copilot."
    });
  }

  const { tenantId, userId, role } = getScopeContext(req);

  // Quick context preparation (sample existing categories, tests & panels)
  let contextCategories = [];
  let contextTests = [];
  let contextPanels = [];
  let databaseAudit = null;
  let missingCatalogTests = null;

  // Identify user query intents
  const isMissingTestsIntent = /(kaun sa test|missing test|nahi hai|kya hona chahiye|suggest test|gap analysis|missing in database|kya kami hai|add karna chahiye|tests chahiye|kaun se test)/i.test(message || "");
  const isMethodInstrumentIntent = /(method|instrument|machine|tarika|equip|analyzer|उपकरण|विधि|inst|खाली|empty)/i.test(message || "");
  const isAuditIntent = isMethodInstrumentIntent || /(audit|check|review|kami|chuti|missing|galat|fix|database|sudhar|sahi|error|inspect)/i.test(message || "");

  try {
    const catDocs = await categorydb
      .find(tenantId ? { $or: [{ tenantId }, { tenantId: null }] } : { createdBy: userId })
      .select("category")
      .limit(20)
      .lean();
    contextCategories = catDocs.map(c => c.category).filter(Boolean);

    const testDocs = await testSchema
      .find(tenantId ? { tenantId } : { createdBy: userId })
      .select("Name")
      .sort({ createdAt: -1 })
      .limit(40)
      .lean();
    contextTests = testDocs.map(t => t.Name).filter(Boolean);

    const panelDocs = await addPannel
      .find(tenantId ? { $or: [{ tenantId }, { createdBy: userId }] } : { createdBy: userId })
      .select("name")
      .sort({ createdAt: -1 })
      .limit(30)
      .lean();
    contextPanels = panelDocs.map(p => p.name).filter(Boolean);

    // If user is asking which tests are missing, run catalog gap analysis
    if (isMissingTestsIntent) {
      missingCatalogTests = await findMissingStandardTests({ tenantId, userId });
    }

    // If user is asking to audit/check/fix the database or methods/instruments, run actual audit
    if (isAuditIntent && !isMissingTestsIntent) {
      databaseAudit = await auditTestsInDatabase({ tenantId, userId, role });
    }
  } catch (err) {
    console.warn("Context fetch warning:", err.message);
  }

  const response = await queryGeminiCopilot({
    userPrompt: message || "Analyze this attached lab report / image and formulate the test / panel.",
    history,
    currentProposal,
    contextData: {
      categories: contextCategories,
      existingTests: contextTests,
      existingPanels: contextPanels,
      databaseAudit,
      missingCatalogTests
    },
    images
  });

  // Action Sanitizer: Never let dummy, placeholder, or invalid actions reach the frontend
  if (response.action && response.action.type && response.action.type !== "NONE") {
    const act = response.action;
    act.data = act.data || {};

    if (act.type === "CREATE_TEST") {
      const tName = String(act.data.Name || act.data.name || "").trim().toLowerCase();
      const pCount = Array.isArray(act.data.parameters) ? act.data.parameters.length : 0;
      if (!tName || tName === "test" || tName.length < 2 || pCount === 0 || isMissingTestsIntent) {
        response.action = { type: "NONE" };
      }
    } else if (act.type === "CREATE_PANEL") {
      const pName = String(act.data.name || act.data.panelName || "").trim().toLowerCase();
      const tCount = Array.isArray(act.data.testNames) ? act.data.testNames.length : 0;
      if (!pName || pName === "panel" || pName.length < 2 || tCount === 0 || isMissingTestsIntent) {
        response.action = { type: "NONE" };
      }
    } else if (act.type === "CREATE_PACKAGE") {
      const pkgName = String(act.data.packageName || act.data.name || "").trim().toLowerCase();
      if (!pkgName || pkgName === "package" || pkgName.length < 2 || isMissingTestsIntent) {
        response.action = { type: "NONE" };
      }
    }
  }

  // Database Method / Instrument Audit Guarantee
  if (databaseAudit) {
    if (
      databaseAudit.fixes &&
      databaseAudit.fixes.length > 0 &&
      (response.action?.type === "BATCH_FIX_TESTS" || response.action?.type === "AUDIT_TESTS" || isMethodInstrumentIntent || (isAuditIntent && (!response.action || response.action.type === "NONE")))
    ) {
      response.action = {
        type: "BATCH_FIX_TESTS",
        summary: "Database Method & Instrument Auto-Fix",
        data: {
          totalAudited: databaseAudit.totalTests,
          issuesFound: databaseAudit.totalIssuesFound,
          fixes: databaseAudit.fixes
        }
      };
    } else if (databaseAudit.totalIssuesFound === 0 && (isMethodInstrumentIntent || isAuditIntent)) {
      response.action = {
        type: "BATCH_FIX_TESTS",
        summary: "Database Quality Check - All Tests Verified",
        data: {
          totalAudited: databaseAudit.totalTests,
          issuesFound: 0,
          fixes: []
        }
      };
    }
  }

  // Target Name Auto-Resolution Safety Net:
  // If Gemini produced an update action without target name, infer it safely
  if (response.action && response.action.type && response.action.type !== "NONE") {
    const act = response.action;
    act.data = act.data || {};

    if (act.type === "UPDATE_PANEL" || act.type === "EDIT_PANEL") {
      if (!act.data.panelName && !act.data.name && !act.data.panel) {
        if (currentProposal?.data?.panelName || currentProposal?.data?.name) {
          act.data.panelName = currentProposal.data.panelName || currentProposal.data.name;
        } else if (act.summary) {
          const pMatch = contextPanels.find(p => act.summary.toLowerCase().includes(p.toLowerCase()));
          if (pMatch) act.data.panelName = pMatch;
        }
        if (!act.data.panelName && message) {
          const pMatch = contextPanels.find(p => message.toLowerCase().includes(p.toLowerCase()));
          if (pMatch) act.data.panelName = pMatch;
        }
        if (!act.data.panelName && response.message) {
          const pMatch = contextPanels.find(p => response.message.toLowerCase().includes(p.toLowerCase()));
          if (pMatch) act.data.panelName = pMatch;
        }
      }
    } else if (act.type === "UPDATE_TEST" || act.type === "EDIT_TEST") {
      if (!act.data.testName && !act.data.Name && !act.data.name) {
        if (currentProposal?.data?.testName || currentProposal?.data?.Name) {
          act.data.testName = currentProposal.data.testName || currentProposal.data.Name;
        } else if (act.summary) {
          const tMatch = contextTests.find(t => act.summary.toLowerCase().includes(t.toLowerCase()));
          if (tMatch) act.data.testName = tMatch;
        }
        if (!act.data.testName && message) {
          const tMatch = contextTests.find(t => message.toLowerCase().includes(t.toLowerCase()));
          if (tMatch) act.data.testName = tMatch;
        }
        if (!act.data.testName && response.message) {
          const tMatch = contextTests.find(t => response.message.toLowerCase().includes(t.toLowerCase()));
          if (tMatch) act.data.testName = tMatch;
        }
      }
    }
  }

  return res.status(200).json({
    success: true,
    message: response.message,
    action: response.action || { type: "NONE" },
    modelUsed: response.modelUsed || "gemini"
  });
});

/**
 * Execute confirmed action (Save Test / Panel / Package / Booking / Fix to MongoDB)
 */
export const executeCopilotAction = asyncHandler(async (req, res) => {
  const { actionType, data } = req.body;

  if (!actionType || !data) {
    return res.status(400).json({
      success: false,
      message: "Action type and data are required."
    });
  }

  const { tenantId, userId, role } = getScopeContext(req);

  let result;
  switch (actionType) {
    case "CREATE_TEST":
      result = await executeCreateTest({ testData: data, tenantId, userId, role });
      break;

    case "UPDATE_TEST":
    case "EDIT_TEST":
      result = await executeUpdateTest({ updateData: data, tenantId, userId, role });
      break;

    case "CREATE_PANEL":
      result = await executeCreatePanel({ panelData: data, tenantId, userId, role });
      break;

    case "UPDATE_PANEL":
    case "EDIT_PANEL":
      result = await executeUpdatePanel({ updateData: data, tenantId, userId, role });
      break;

    case "CREATE_PACKAGE":
      result = await executeCreatePackage({ packageData: data, tenantId, userId, role });
      break;

    case "UPDATE_PACKAGE":
    case "EDIT_PACKAGE":
      result = await executeUpdatePackage({ updateData: data, tenantId, userId, role });
      break;

    case "CREATE_BOOKING":
      result = await executeCreateBooking({
        bookingData: data,
        tenantId,
        userId,
        role,
        currentUser: req.user
      });
      break;

    case "FIX_TEST":
      result = await executeFixTest({
        testId: data.testId,
        currentName: data.currentName,
        testName: data.testName || data.Name,
        updates: data.updates,
        tenantId,
        userId,
        role
      });
      break;

    case "BATCH_FIX_TESTS":
      result = await executeBatchFixTests({ fixes: data.fixes, tenantId, userId, role });
      break;

    default:
      return res.status(400).json({
        success: false,
        message: `Unknown action type: ${actionType}`
      });
  }

  return res.status(200).json({
    success: result.success !== false,
    message: result.message || "Action successfully executed.",
    data: result
  });
});

/**
 * Check Gemini API setup status
 */
export const getCopilotStatus = asyncHandler(async (req, res) => {
  const isConfigured = Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim().length > 5);
  const { tenantId, userId, role } = getScopeContext(req);
  if (tenantId) {
    repairPreviousCopilotBookings({
      tenantId,
      userId,
      username: req.user?.username,
      role
    }).catch(() => {});
  }
  return res.status(200).json({
    success: true,
    configured: isConfigured,
    model: "gemini-2.5-flash / gemini-flash-latest"
  });
});

/**
 * Search lab catalog (Tests, Panels, Packages)
 */
export const searchCatalog = asyncHandler(async (req, res) => {
  const { q } = req.query;
  const { tenantId, userId } = getScopeContext(req);
  const results = await searchLabCatalog({ query: q, tenantId, userId });
  return res.status(200).json({ success: true, results });
});
