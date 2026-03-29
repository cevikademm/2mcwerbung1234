import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://smxadfujomneusxclqbu.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNteGFkZnVqb21uZXVzeGNscWJ1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ3NTIwNTEsImV4cCI6MjA4MDMyODA1MX0.KeiHyOyYvohm2VghXrTDLEEwKnra-uN6uPUWVgxvo6Y';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function resetPassword() {
    console.log("Şifre sıfırlanıyor...");
    const { error } = await supabase
        .from('app_settings')
        .update({ admin_password: '123456' })
        .neq('id', '00000000-0000-0000-0000-000000000000');

    if (error) {
        console.error("Hata:", error.message);
        process.exit(1);
    } else {
        console.log("Başarılı! Admin şifresi 123456 yapıldı.");
        process.exit(0);
    }
}

resetPassword();
