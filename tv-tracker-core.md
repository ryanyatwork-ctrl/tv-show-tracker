1\. What data lives on the device



The following data is stored locally on the user’s device and must remain fully usable without an internet connection:



Show title



Watch status (e.g., watching, completed, paused)



Optional season and/or episode progress



Star rating (paid feature)



Rewatch count (paid feature)



Optional user notes



Core rule:

If the app never goes online again, this data must remain understandable, editable, and meaningful to the user.



The app does not depend on continued availability of streaming platforms or external services to interpret this data.



2\. What requires an internet connection



Internet access is required only for the following actions:



Searching for and adding new shows



Syncing data across devices (paid feature, future)



No other functionality should initiate network requests.



Guiding principle:

Any unexpected or implicit network activity is considered a design error.



3\. Offline behavior



When the device is offline:



The app opens instantly



All existing shows are fully accessible



Watch progress can be edited



Star ratings can be edited (if unlocked)



Notes can be edited (if present)



Attempting to add a new show while offline results in a clear, calm message explaining that an internet connection is required to search for new shows.



No loading spinners, retries, or background requests should occur while offline.



This behavior is intentional and must be consistent across:



the user experience



app-store review explanations



public documentation (README, FAQ)



4\. Free tier capabilities



The free tier allows:



Tracking up to 20 shows



Full offline access to tracked shows



Local-only data storage



No account creation



No cross-device sync



No star ratings



No suggestions or recommendations



The free tier exists to validate usefulness, not to replicate the full product.



All limits must be enforced deterministically and locally.



5\. Paid unlock ($1.99) capabilities



A one-time purchase unlocks:



Unlimited number of tracked shows



Star ratings



Rewatch tracking



Suggestions and recommendations



Account sign-in and cross-device sync (future)



These capabilities function as explicit feature flags.

Each paid feature must be individually gated and testable.

