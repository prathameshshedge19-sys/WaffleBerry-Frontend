// Developer-page UI orchestration only. The shared client owns every token,
// cookie, login, refresh and authenticated request.
export function createDevAuth({ auth, onState }) {
  let signedIn = false;
  const authenticationFailure = (error) => error?.status === 401;
  const show = (state, message) => {
    signedIn = state === "signed_in";
    onState({ state, message, signedIn });
  };
  const prompt = "Sign in to the local test account before starting the microphone.";
  show("checking", "Checking the local session…");
  const ready = (async () => {
    try {
      const user = await auth.ensureAuthenticated();
      show("signed_in", `Signed in as ${user.email}. Microphone test ready.`);
    } catch (error) {
      show("signed_out", authenticationFailure(error) ? prompt : "Could not check the local session. Check that the local backend is running, then sign in.");
    }
  })();
  return {
    ready,
    async login(email, password) {
      // Finish restoration before login; a late failed restoration must never
      // clear the access token issued by the new login.
      await ready;
      show("checking", "Signing in to the local backend…");
      let stage = "login";
      try {
        await auth.authenticateUser(email.trim(), password);
        stage = "verification";
        const user = await auth.ensureAuthenticated();
        show("signed_in", `Signed in as ${user.email}. Microphone test ready.`);
        return true;
      } catch (error) {
        show("signed_out", authenticationFailure(error)
          ? stage === "login"
            ? "Sign-in failed: check the email and password for the local test account. Regular accounts are not in the disposable test database."
            : "The local backend could not verify the new session. Please sign in again."
          : error.message || "Could not sign in to the local backend.");
        return false;
      }
    },
    async requireSession() {
      await ready;
      if (!signedIn) { show("signed_out", prompt); return false; }
      try {
        await auth.ensureAuthenticated();
        return true;
      } catch (error) {
        show("signed_out", authenticationFailure(error) ? prompt : "Could not verify the local session. Please try signing in again.");
        return false;
      }
    },
  };
}
