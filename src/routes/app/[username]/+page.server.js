const BACKEND = "https://backend.umc.jasonsika.com";

export async function load({ params, fetch }) {
    const userRes = await fetch(`${BACKEND}/api/users/${params.username}`);

    if (userRes.status === 404) {
        return { notFound: true, user: null };
    }

    const { user } = await userRes.json();
    return { notFound: false, user };
}