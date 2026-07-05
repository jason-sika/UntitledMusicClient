// src/routes/verify/+page.js
export function load({ url }) {
    return {
        email: url.searchParams.get('email') ?? ''
    };
}