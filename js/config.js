
// IndentFlow v3 - Production Application (Supabase-backed)

// ============ SUPABASE CONFIG ============
// IMPORTANT: Replace these with your Supabase project values
var SUPABASE_URL = 'https://ttnmuhhikupimebvvrhc.supabase.co';
var SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR0bm11aGhpa3VwaW1lYnZ2cmhjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg4OTYyMTUsImV4cCI6MjEwNDQ3MjIxNX0.ojelg9vQHiiauY3bBR9QBIgFhM8pqOuKXNHdOLMvajs';
var supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

var { useState, useReducer, useContext, createContext, useEffect, useCallback, useMemo, useRef } = React;
