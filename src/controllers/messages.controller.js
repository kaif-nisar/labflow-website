import { Conversation } from "../models/message.model.js";
import { newBooking } from "../models/NewBooking.model.js";

const saveConversation = async (req, res) => {
  try {
    const { senderId, receiverId, bookingId, message } = req.body;
    const tenantId = req.user.tenantId;
    const createdBy = req.user._id;
    const role = req.user.role;

    console.log("tenantId in saveConversation:", tenantId._id);
    console.log("createdBy in saveConversation:", createdBy);

    // Validate required fields
    if (!bookingId || !message || !tenantId || !createdBy) {
      return res.status(400).json({ error: "All required fields must be provided." });
    }

    // Find if a conversation already exists
    let conversation = await Conversation.findOne({
      tenantId: tenantId._id,
      bookingId,
    });

    if (!conversation) {
      // Create a new conversation if none exists
      conversation = new Conversation({
        senderId,
        receiverId,
        bookingId,
        tenantId: tenantId?._id,
        createdBy: createdBy,
        messages: [{
          senderId,
          message,  // The message is added as a string
          adminwatched: role === "admin" ? true : false,
          franchiseewatched: role === "admin" ? false : true,
          timestamp: new Date(),
        }],
        lastMessage: {
          message,  // The lastMessage is also added as a string
          adminwatched: role === "admin" ? true : false,
          franchiseewatched: role === "admin" ? false : true,
          timestamp: new Date(),
        },
      });
    } else {
      // Add the new message to existing conversation
      const newMessage = {
        senderId,
        message,  // Ensure the message is a string
        adminwatched: role === "admin" ? true : false,
        franchiseewatched: role === "admin" ? false : true,
        timestamp: new Date(),
      };

      conversation.messages.push(newMessage);
      conversation.lastMessage = {
        message,  // Ensure lastMessage is a string
        adminwatched: role === "admin" ? true : false,
        franchiseewatched: role === "admin" ? false : true,
        timestamp: new Date(),
      };
    }

    // Save the conversation to the database
    await conversation.save();

    // Return the conversation or last message to the client
    res.status(200).json({
      send: true,
      conversation: conversation,  // Return conversation data for UI
    });
  } catch (error) {
    console.error("Error saving conversation:", error);
    res.status(500).json({ error: "An error occurred while saving the conversation." });
  }
};

const getConversationByBookingId = async (req, res) => {
  try {
    const { bookingId } = req.body; // bookingId ko params se la rahe hain

    // Validate bookingId
    if (!bookingId) {
      return res.status(400).json({ error: "Booking ID is required." });
    }

    // Find the conversation by bookingId
    const conversation = await Conversation.findOne({ bookingId });

    // If conversation is not found
    if (!conversation) {
      return res.status(200).json({ message: "Conversation not found for this booking ID.", status: "empty" });
    }

    // Return the conversation data
    res.status(200).json({ conversation });
  } catch (error) {
    console.error("Error fetching conversation:", error);
    res.status(500).json({ error: "An error occurred while fetching the conversation." });
  }
};

const getnewnotificationforadmin = async (req, res) => {
  const role = req.user.role;
  const tenantId = req.user.tenantId._id;

  if (role !== "admin" && role !== "staff") {
    console.log("role is not the admin or staff");
    return res.status(403).json({ message: "Unauthorized", status: "failed" });
  }

  const notseenconversation = await Conversation.find({
    tenantId: tenantId,
    "lastMessage.adminwatched": false
  }).populate('createdBy').lean(); // Use lean() to modify documents easily

  if (notseenconversation.length === 0) {
    console.log("no message for admin");
    return res.status(200).json({ message: "no messages for admin", status: "empty" });
  }

  // Use Promise.all to fetch all related bookings in parallel
  const enrichedConversations = await Promise.all(
    notseenconversation.map(async (conv) => {
      const relatedBooking = await newBooking.findOne({
        bookingId: conv.bookingId,
        tenantId: tenantId
      }).populate("createdBy").lean();

      if (relatedBooking) {
        conv.relatedbooking = relatedBooking;
      } else {
        conv.relatedbooking = null; // optional: if no booking found
      }

      return conv;
    })
  );

  return res.status(200).json(enrichedConversations);
};

const getnewnotificationforfranshisee = async (req, res) => {
  const role = req.user.role;
  const tenantId = req.user.tenantId._id;
  const userId = req.user._id;

  if (role === "admin") {
    console.log("role is not match any to franchisee");
    return res.status(403).json({ message: "Unauthorized for franchisee notifications" });
  }

  const notseenconversation = await Conversation.find({
    tenantId: tenantId,
    receiverId: userId,
    "lastMessage.franchiseewatched": false
  }).lean();

  if (notseenconversation.length === 0) {
    console.log("no message for franchisee");
    return res.status(200).json({ message: "no messages for franchisee", status: "empty" });
  }

  const enrichedConversations = await Promise.all(
    notseenconversation.map(async (conv) => {
      const relatedBooking = await newBooking.findOne({
        bookingId: conv.bookingId,
        createdBy: userId,
        tenantId: tenantId
      }).populate("createdBy").lean();

      conv.relatedbooking = relatedBooking || null; // add null if not found
      return conv;
    })
  );

  return res.status(200).json(enrichedConversations);
};

const changewatchedstatus = async (req, res) => {
  const role = req.user.role;
  const docId = req.params.docId;

  const edition = role === "admin" ? { "lastMessage.adminwatched": true } : { "lastMessage.franchiseewatched": true }

  const changedDoc = await Conversation.findByIdAndUpdate(
    { _id: docId },
    edition,
    { new: true }
  )

  if (!changedDoc) {
    return res.status(401).json({ message: "! conversation not updated" })
  }

  return res.status(200).json({ message: "conversation updated successfully" })
}

export {
  saveConversation, getConversationByBookingId,
  getnewnotificationforadmin, getnewnotificationforfranshisee,
  changewatchedstatus
};
