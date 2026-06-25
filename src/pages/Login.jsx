import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabase';

export default function Login() {
  const [isLoginMode, setIsLoginMode] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        navigate('/dashboard');
      } else {
        localStorage.clear();
      }
    };
    checkSession();
  }, [navigate]);

  const toggleMode = () => {
    setIsLoginMode(!isLoginMode);
    setErrorMsg(null);
    setSuccessMsg(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    if (isLoginMode) {
      // Login
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        setErrorMsg(error.message === "Invalid login credentials" ? "E-posta veya şifre hatalı." : error.message);
        setIsLoading(false);
      } else {
        navigate('/dashboard');
      }
    } else {
      // Register
      const { error } = await supabase.auth.signUp({ email, password });
      if (error) {
        setErrorMsg("Kayıt Hatası: " + error.message);
        setIsLoading(false);
      } else {
        setSuccessMsg("Kayıt başarılı! Lütfen giriş yapın.");
        setIsLoading(false);
        setTimeout(() => setIsLoginMode(true), 2000);
      }
    }
  };

  return (
    <div className="login-wrapper">
      <div className="login-card">
        <div className="logo">CEMER <span>AR STUDIO</span></div>
        <div className="subtitle">
          {isLoginMode ? "Yönetim paneline erişmek için giriş yapın" : "Yeni bir hesap oluşturun"}
        </div>

        {errorMsg && <div className="error-msg">{errorMsg}</div>}
        {successMsg && <div className="success-msg">{successMsg}</div>}

        <form onSubmit={handleSubmit}>
          <div className="input-group">
            <span className="label">E-Posta Adresi</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="ornek@cemer.com.tr"
            />
          </div>

          <div className="input-group">
            <span className="label">Şifre</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              placeholder="••••••••"
            />
          </div>

          <button type="submit" className="btn" disabled={isLoading}>
            {isLoading ? "İşlem Yapılıyor..." : (isLoginMode ? "Giriş Yap" : "Kayıt Ol")}
          </button>
        </form>

        <div className="toggle-text">
          <span>{isLoginMode ? "Hesabınız yok mu? " : "Zaten hesabınız var mı? "}</span>
          <a onClick={toggleMode}>
            {isLoginMode ? "Kayıt Olun" : "Giriş Yapın"}
          </a>
        </div>
      </div>
    </div>
  );
}
