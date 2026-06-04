const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  "https://yvqaproltcskufufmomi.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl2cWFwcm9sdGNza3VmdWZtb21pIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MDA2NDc3MiwiZXhwIjoyMDk1NjQwNzcyfQ.hv81ELR5VR8qlkqASiXUz5WEm7Um8BZ8HNeL6WGcslA"
);

async function resetPassword() {
  const { data, error } = await supabase.auth.admin.updateUserById(
    "5cd6c4f7-4be9-4a41-b4f9-b9ecf2ead823",
    { password: "Agentix@2026" }
  );
  if (error) {
    console.log("ERROR:", error.message);
  } else {
    console.log("Password reset ho gaya!");
    console.log("Email:", data.user.email);
    console.log("New Password: Agentix@2026");
  }
}

resetPassword();
