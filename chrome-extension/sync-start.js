/* global exportSubscribers */
const sourceTabId = Number(new URL(location.href).searchParams.get("tab"));
if (Number.isSafeInteger(sourceTabId) && sourceTabId > 0) void exportSubscribers(true, sourceTabId);
else document.getElementById("status").textContent = "Open your publication's Subscribers dashboard and start sync from the connector.";
