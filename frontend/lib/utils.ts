export function calculateTimeUntilExpiry(expiresAt: string | null | undefined): string | null {
    if (!expiresAt) return null;
    const expiry = new Date(expiresAt);
    const now = new Date();
    const diff = expiry.getTime() - now.getTime();
    
    if (diff < 0) return "Expired";
    
    const months = Math.floor(diff / (1000 * 60 * 60 * 24 * 30));
    const days = Math.floor((diff % (1000 * 60 * 60 * 24 * 30)) / (1000 * 60 * 60 * 24));
    
    if (months > 0) {
      return `Expires in ${months} ${months === 1 ? "month" : "months"}`;
    }
    return `Expires in ${days} ${days === 1 ? "day" : "days"}`;
  }