#![no_std]

use soroban_sdk::{contract, contractimpl, contracttype, Address, Bytes, BytesN, Env};

use soroban_sdk::{
    contract, contracterror, contractevent, contractimpl, panic_with_error, Address, Bytes, BytesN,
    Env, IntoVal, Symbol,
};

/// Storage keys (placeholders)
mod keys {
    pub const ADDR: &[u8] = b"RES_ADDR";      // namehash -> Address
    pub const TEXT: &[u8] = b"RES_TEXT_";     // namespace prefix: TEXT || key || namehash -> String
    pub const REGISTRY: &[u8] = b"RES_REG";   // singleton: Address (Registry contract)
}

/// Events (placeholders)
#[derive(Clone)]
#[contracttype]
pub struct EvtAddressChanged {
    pub namehash: BytesN<32>,
    pub addr: Address,
}

#[derive(Clone)]
#[contracttype]
pub struct EvtTextChanged {
    pub namehash: BytesN<32>,
    pub key: Bytes,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[contracterror]
#[repr(u32)]
pub enum ResolverError {
    NotInitialized = 1,
    AlreadyInitialized = 2,
    NotOwner = 3,
    InvalidInput = 4,
}

const MAX_TEXT_KEY_LEN: u32 = 256;
fn registry_storage_key(env: &Env) -> Bytes {
    Bytes::from_slice(env, keys::REGISTRY)
}

fn addr_storage_key(env: &Env, namehash: &BytesN<32>) -> Bytes {
    let mut key = Bytes::from_slice(env, keys::ADDR);
    key.extend_from_array(&namehash.to_array());
    key
}

fn text_storage_key(env: &Env, namehash: &BytesN<32>, text_key: &Bytes) -> Bytes {
    let mut key = Bytes::from_slice(env, keys::TEXT);
    key.extend_from_array(&namehash.to_array());
    key.append(text_key);
    key
}

fn validate_text_key(env: &Env, key: &Bytes) {
    if key.len() == 0 || key.len() > MAX_TEXT_KEY_LEN {
        panic_with_error!(env, ResolverError::InvalidInput);
    }
}

fn ensure_initialized(env: &Env) -> Address {
    let storage = env.storage().persistent();
    let key = registry_storage_key(env);
    storage
        .get(&key)
        .unwrap_or_else(|| panic_with_error!(env, ResolverError::NotInitialized))
}


#[contract]
pub struct Resolver;

#[contractimpl]
impl Resolver {
    /// Trivial export — replace with real constructor that sets Registry address.
    pub fn version(_env: Env) -> u32 {
        1
    }

    pub fn init(env: Env, registry: Address) {
        let storage = env.storage().persistent();
        let key = registry_storage_key(&env);
        if storage.has(&key) {
            panic_with_error!(&env, ResolverError::AlreadyInitialized);
        }
        storage.set(&key, &registry);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::Env;

    #[test]
    fn it_compiles_and_returns_version() {
        let e = Env::default();
        let id = e.register(Resolver, ());
        let client = ResolverClient::new(&e, &id);
        assert_eq!(client.version(), 1);
    }
}
