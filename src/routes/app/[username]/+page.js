// src/routes/[username]/+page.js
export async function load({ params, fetch }) {
    const res = await fetch(
        `https://backend.umc.jasonsika.com/api/users/${params.username}`
    );

    if (!res.ok) {
        return { user: null, notFound: true };
    }

    const data = await res.json();
    return { user: data.user, notFound: false };
}