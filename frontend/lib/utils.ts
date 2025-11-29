export function calculateTimeUntilExpiry(expiresAt: string | null | undefined): string | null {
    if (!expiresAt) return null;
    const expiry = new Date(expiresAt);
    const now = new Date();
    const diff = expiry.getTime() - now.getTime();
    
    if (diff < 0) return "Expired";
    
    // Calculate actual calendar months difference
    let months = (expiry.getFullYear() - now.getFullYear()) * 12 + (expiry.getMonth() - now.getMonth());
    
    // If the day of expiry is before the day of now, we haven't reached that month yet
    if (expiry.getDate() < now.getDate()) {
      months--;
    }
    
    // Calculate remaining days by creating a date that is 'months' months from now
    const monthsFromNow = new Date(now);
    monthsFromNow.setMonth(now.getMonth() + months);
    const daysRemaining = Math.floor((expiry.getTime() - monthsFromNow.getTime()) / (1000 * 60 * 60 * 24));
    
    if (months > 0) {
      return `Expires in ${months} ${months === 1 ? "month" : "months"}`;
    }
    return `Expires in ${daysRemaining} ${daysRemaining === 1 ? "day" : "days"}`;
  }