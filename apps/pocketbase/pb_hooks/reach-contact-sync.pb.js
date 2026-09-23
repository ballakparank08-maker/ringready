/// <reference path="../pb_data/types.d.ts" />

// Forwards every new sign-up (users auth record) to the connected Reach
// email-marketing account. Reach requires an email — submissions without one
// are skipped. Any Reach failure is logged and swallowed so the local user
// record is always kept.
onRecordAfterCreateSuccess((e) => {
  const email = e.record.get("email");
  if (!email) {
    e.next();
    return;
  }

  try {
    $http.send({
      url: $os.getenv("REACH_API_URL") + "/api/public/v1/contacts",
      method: "POST",
      headers: {
        Authorization: "Bearer " + $os.getenv("REACH_API_TOKEN"),
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        groupName: "Hostinger AI Builder sign-up form",
        contacts: [
          {
            email: email,
            name: e.record.get("name") || "",
            surname: "",
            phone: "",
          },
        ],
      }),
    });
  } catch (err) {
    $app.logger().error("Reach contact sync failed", "err", String(err));
  }

  e.next();
}, "users");
