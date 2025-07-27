require('dotenv').config(); // Charge les variables d'environnement depuis .env

const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');

const app = express();
const port = process.env.PORT || 3000; // Utilise le port défini dans .env ou 3000 par défaut

// --- Configuration CORS ---
// IMPORTANT : Remplacez 'http://localhost:8080' par l'URL de votre site GitHub Pages quand il sera déployé !
// Par exemple: 'https://votre_pseudo.github.io/votre_repo/'
// Pour les tests locaux, vous pouvez laisser 'http://localhost:8080' ou '*' (moins sécurisé)
const corsOptions = {
  origin: 'https://tes-1-w5nn.onrender.com' // À modifier pour votre URL GitHub Pages déployée (e.g., 'https://bfg-fw.github.io/tes/')
};
app.use(cors(corsOptions));

app.use(express.json()); // Permet à Express de lire le JSON envoyé dans les requêtes

// --- Configuration de la base de données PostgreSQL ---
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false // Important pour Render.com pour éviter les problèmes de certificat SSL en développement/test
  }
});

// --- Test de connexion à la base de données ---
pool.connect((err, client, release) => {
  if (err) {
    return console.error('Erreur lors de la connexion à la base de données', err.stack);
  }
  console.log('Connecté à la base de données PostgreSQL');
  release();
});

// --- Initialisation des tables de la base de données ---
async function setupDatabaseTables() {
  try {
    // Table pour les utilisateurs et leurs mots de passe
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        username VARCHAR(255) PRIMARY KEY,
        password VARCHAR(255) NOT NULL
        -- Dans une vraie application, le mot de passe serait haché (bcrypt)
      );
    `);
    console.log('Table "users" vérifiée/créée.');

    // Table pour les données de chaque utilisateur (participants et équipes)
    // JSONB est un type de données PostgreSQL qui stocke le JSON efficacement
    await pool.query(`
      CREATE TABLE IF NOT EXISTS user_data (
        username VARCHAR(255) PRIMARY KEY REFERENCES users(username) ON DELETE CASCADE,
        personnes JSONB,
        equipes JSONB
      );
    `);
    console.log('Table "user_data" vérifiée/créée.');
  } catch (err) {
    console.error('Erreur lors de la configuration des tables de la base de données:', err);
  }
}

// Appeler la fonction d'initialisation au démarrage du serveur
setupDatabaseTables();


// --- Routes API ---

// API pour l'inscription d'un nouvel utilisateur
app.post('/api/register', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ message: 'Nom d\'utilisateur et mot de passe requis.' });
  }

  try {
    const existingUser = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
    if (existingUser.rows.length > 0) {
      return res.status(409).json({ message: 'Nom d\'utilisateur déjà pris.' });
    }
    await pool.query('INSERT INTO users (username, password) VALUES ($1, $2)', [username, password]);
    res.status(201).json({ message: 'Inscription réussie.' });
  } catch (err) {
    console.error('Erreur lors de l\'inscription:', err);
    res.status(500).json({ message: 'Erreur serveur lors de l\'inscription.' });
  }
});

// API pour la connexion d'un utilisateur
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ message: 'Nom d\'utilisateur et mot de passe requis.' });
  }

  try {
    const result = await pool.query('SELECT * FROM users WHERE username = $1 AND password = $2', [username, password]);
    if (result.rows.length > 0) {
      res.status(200).json({ message: 'Connexion réussie.' });
    } else {
      res.status(401).json({ message: 'Nom d\'utilisateur ou mot de passe incorrect.' });
    }
  } catch (err) {
    console.error('Erreur lors de la connexion:', err);
    res.status(500).json({ message: 'Erreur serveur lors de la connexion.' });
  }
});

// API pour sauvegarder les données (personnes et équipes) d'un utilisateur
// C'est cette route que votre frontend appellera pour sauvegarder
// ... (début de la route)
app.post('/api/saveData', async (req, res) => {
  const { username, personnes, equipes } = req.body;

  // --- AJOUTEZ CES LIGNES POUR VÉRIFIER CE QUE LE BACKEND REÇOIT ---
  console.log('Backend a reçu username:', username);
  console.log('Backend a reçu personnes (type):', typeof personnes);
  console.log('Backend a reçu personnes (valeur):', JSON.stringify(personnes, null, 2)); // Stringify pour voir le contenu
  console.log('Backend a reçu equipes (type):', typeof equipes);
  console.log('Backend a reçu equipes (valeur):', JSON.stringify(equipes, null, 2)); // Stringify pour voir le contenu
  // --- FIN DES LIGNES DE VÉRIFICATION ---

  if (!username || personnes === undefined || equipes === undefined) {
    return res.status(400).json({ message: 'Nom d\'utilisateur et données (personnes, equipes) requis.' });
  }

  try {
    await pool.query(
      `INSERT INTO user_data (username, personnes, equipes)
       VALUES ($1, $2, $3)
       ON CONFLICT (username) DO UPDATE SET personnes = $2, equipes = $3;`,
      [username, personnes, equipes]
    );
    res.status(200).json({ message: 'Données sauvegardées avec succès.' });
  } catch (err) {
    console.error('Erreur lors de la sauvegarde des données:', err);
    res.status(500).json({ message: 'Erreur serveur lors de la sauvegarde des données.' });
  }
});
  // Dans une vraie application, vous vérifieriez ici que 'username' correspond à l'utilisateur authentifié
  // Pour l'instant, on se base sur le 'username' envoyé par le client.
  try {
    // INSERT ou UPDATE si l'utilisateur existe déjà
    await pool.query(
      `INSERT INTO user_data (username, personnes, equipes)
       VALUES ($1, $2, $3)
       ON CONFLICT (username) DO UPDATE SET personnes = $2, equipes = $3;`,
      [username, personnes, equipes]
    );
    res.status(200).json({ message: 'Données sauvegardées avec succès.' });
  } catch (err) {
    console.error('Erreur lors de la sauvegarde des données:', err);
    res.status(500).json({ message: 'Erreur serveur lors de la sauvegarde des données.' });
  }
});

// API pour charger les données (personnes et équipes) d'un utilisateur
// C'est cette route que votre frontend appellera pour charger
app.get('/api/loadData/:username', async (req, res) => {
  const { username } = req.params;
  if (!username) {
    return res.status(400).json({ message: 'Nom d\'utilisateur requis.' });
  }

  // Dans une vraie application, vous vérifieriez ici que 'username' correspond à l'utilisateur authentifié
  try {
    const result = await pool.query('SELECT personnes, equipes FROM user_data WHERE username = $1', [username]);
    if (result.rows.length > 0) {
      res.status(200).json({
        personnes: result.rows[0].personnes || [], // Retourne un tableau vide si les données sont null
        equipes: result.rows[0].equipes || []      // Retourne un tableau vide si les données sont null
      });
    } else {
      // Si l'utilisateur n'a pas encore de données (ex: vient de s'inscrire ou est un nouvel utilisateur_data)
      res.status(200).json({ personnes: [], equipes: [] });
    }
  } catch (err) {
    console.error('Erreur lors du chargement des données:', err);
    res.status(500).json({ message: 'Erreur serveur lors du chargement des données.' });
  }
});


// Démarrer le serveur
app.listen(port, () => {
  console.log(`Serveur backend écoutant sur le port ${port}`);
});
