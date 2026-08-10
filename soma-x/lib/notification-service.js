const SERVER_URL = process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3002';

export async function fetchNotifications(userEmail) {
    if (!userEmail) return { notifications: [], unreadCount: 0, isProfileIncomplete: false };
    try {
        const response = await fetch(`${SERVER_URL}/notifications?userEmail=${encodeURIComponent(userEmail)}`);
        if (!response.ok) throw new Error('Failed to fetch notifications');
        return await response.json();
    } catch (error) {
        console.error('Error fetching notifications:', error);
        return { notifications: [], unreadCount: 0, isProfileIncomplete: false };
    }
}

export async function markNotificationAsRead(id) {
    try {
        const response = await fetch(`${SERVER_URL}/notifications/${id}/read`, {
            method: 'PATCH',
        });
        if (!response.ok) throw new Error('Failed to mark notification as read');
        return await response.json();
    } catch (error) {
        console.error('Error marking notification as read:', error);
    }
}

export async function markAllNotificationsAsRead(userEmail) {
    try {
        const response = await fetch(`${SERVER_URL}/notifications/read-all`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userEmail }),
        });
        if (!response.ok) throw new Error('Failed to mark all notifications as read');
        return await response.json();
    } catch (error) {
        console.error('Error marking all notifications as read:', error);
    }
}

export async function deleteNotification(id) {
    try {
        const response = await fetch(`${SERVER_URL}/notifications/${id}`, {
            method: 'DELETE',
        });
        if (!response.ok) throw new Error('Failed to delete notification');
        return await response.json();
    } catch (error) {
        console.error('Error deleting notification:', error);
    }
}
