(() => {
  const offlineMessage =
    "Offline mode is enabled. Online Razorpay checkout is unavailable on this machine.";

  class OfflineRazorpay {
    constructor(options = {}) {
      this.options = options;
    }

    on() {
      return this;
    }

    open() {
      console.warn(offlineMessage, this.options);

      if (typeof this.options.modal?.ondismiss === "function") {
        try {
          this.options.modal.ondismiss();
        } catch (error) {
          console.error("Offline Razorpay stub dismissal handler failed:", error);
        }
      }

      if (typeof window !== "undefined" && typeof window.alert === "function") {
        window.alert(offlineMessage);
      }
    }

    close() {
      return this;
    }
  }

  if (typeof window !== "undefined") {
    window.__OFFLINE_RAZORPAY__ = true;
    window.Razorpay = OfflineRazorpay;
  }
})();
