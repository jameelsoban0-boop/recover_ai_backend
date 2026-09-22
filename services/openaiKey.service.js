// ============================================
// OPENAI API KEY SERVICE
// ============================================
//
// The key server is the source of truth.
//
// Behavior:
// - Fetches the key only when needed.
// - Reuses the cached key for multiple requests.
// - Automatically checks for a new key after the
//   refresh interval.
// - Does NOT expose the key to the mobile client.
// - Does NOT log the actual key.
//

const KEY_SERVER_URL =
    "https://openaikeysecret.oxmite.com/api-key";


// Refresh the cached key every 10 minutes.
//
// You can change this later if needed.
// 10 minutes = 600,000 milliseconds.
const KEY_REFRESH_INTERVAL =
    10 * 60 * 1000;


// Cached key
let openAiApiKey = null;


// Time when the key was fetched
let keyFetchedAt = 0;


// Prevent multiple requests from fetching
// the key server at the same time.
let fetchPromise = null;


// ============================================
// FETCH KEY FROM KEY SERVER
// ============================================

const fetchOpenAiApiKey = async () => {

    const adminToken = String(
        process.env.ADMIN_TOKEN || ""
    ).trim();


    if (!adminToken) {

        const error =
            new Error(
                "ADMIN_TOKEN is not configured"
            );

        error.statusCode = 503;

        throw error;
    }


    const response = await fetch(
        KEY_SERVER_URL,
        {
            method: "GET",

            headers: {
                Authorization:
                    `Bearer ${adminToken}`,
            },
        }
    );


    if (!response.ok) {

        const errorText =
            await response.text();


        const error =
            new Error(
                `Failed to fetch OpenAI API key: ${response.status} ${errorText}`
            );

        error.statusCode = 503;

        throw error;
    }


    const apiKey =
        (await response.text()).trim();


    if (!apiKey) {

        const error =
            new Error(
                "OpenAI API key server returned an empty key"
            );

        error.statusCode = 503;

        throw error;
    }


    return apiKey;
};


// ============================================
// GET CURRENT OPENAI API KEY
// ============================================

const getOpenAiApiKey = async () => {

    const now = Date.now();


    // ----------------------------------------
    // USE CACHED KEY
    // ----------------------------------------
    //
    // If we already have a key and it has not
    // reached the refresh interval, reuse it.
    //

    if (
        openAiApiKey &&
        (now - keyFetchedAt) <
        KEY_REFRESH_INTERVAL
    ) {

        return {
            key: openAiApiKey,
            changed: false,
        };
    }


    // ----------------------------------------
    // ANOTHER REQUEST IS ALREADY REFRESHING
    // ----------------------------------------
    //
    // Prevent multiple simultaneous requests
    // from hitting the key server.
    //

    if (fetchPromise) {

        const key =
            await fetchPromise;

        return {
            key,
            changed: false,
        };
    }


    // ----------------------------------------
    // REFRESH KEY
    // ----------------------------------------

    fetchPromise =
        (async () => {

            try {

                const newKey =
                    await fetchOpenAiApiKey();


                const changed =
                    openAiApiKey !==
                    newKey;


                // Replace cached key
                openAiApiKey =
                    newKey;


                // Update fetch time
                keyFetchedAt =
                    Date.now();


                if (changed) {

                    console.log(
                        "OpenAI API key refreshed"
                    );

                } else {

                    console.log(
                        "OpenAI API key checked and remains unchanged"
                    );
                }


                return newKey;

            } finally {

                fetchPromise =
                    null;
            }
        })();


    try {

        const key =
            await fetchPromise;


        return {
            key,
            changed:
                true,
        };

    } catch (error) {

        // ------------------------------------
        // FALLBACK TO OLD KEY
        // ------------------------------------
        //
        // If we already have a working key but
        // the refresh server temporarily fails,
        // continue using the old key.
        //

        if (openAiApiKey) {

            console.error(
                "Failed to refresh OpenAI API key. Using cached key."
            );


            return {
                key: openAiApiKey,
                changed: false,
            };
        }


        throw error;
    }
};


// ============================================
// EXPORT
// ============================================

module.exports = {
    getOpenAiApiKey,
};
