export const connectMetaAds = async () => {
  try {
    const token = localStorage.getItem("accessToken");

    if (!token) {
      alert("Please login first");
      return;
    }

    const res = await fetch("http://localhost:5000/api/auth/meta/connect", {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    const data = await res.json();

    console.log("OAuth URL:", data);

    if (!data?.data?.url) {
      throw new Error("No OAuth URL received");
    }

    window.location.href = data.data.url;
  } catch (error) {
    console.error("Meta connect error:", error);
    alert("Failed to connect Meta Ads");
  }
};