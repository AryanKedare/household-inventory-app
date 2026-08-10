interface FirebaseLikeError {
  code?: string;
  message?: string;
}

export function toUserMessage(error: unknown): string {
  const value = error as FirebaseLikeError;

  switch (value.code) {
    case 'auth/invalid-credential':
      return 'The email or password is incorrect.';
    case 'auth/email-already-in-use':
      return 'An account already exists with this email.';
    case 'auth/invalid-email':
      return 'Enter a valid email address.';
    case 'auth/weak-password':
      return 'Choose a stronger password.';
    case 'auth/network-request-failed':
      return 'Unable to connect. Check your internet connection and try again.';
    case 'permission-denied':
    case 'functions/permission-denied':
      return 'You do not have permission to perform this action.';
    case 'functions/not-found':
      return 'The invite code is invalid or no longer active.';
    case 'functions/unauthenticated':
      return 'Your session expired. Sign in again.';
    case 'functions/invalid-argument':
      return value.message || 'Check the information and try again.';
    default:
      return 'Something went wrong. Please try again.';
  }
}
