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
#[contractevent(topics = ["address_changed"])]
pub struct EvtAddressChanged {
    #[topic]
    pub namehash: BytesN<32>,
    pub addr: Address,
}

#[derive(Clone)]
#[contractevent(topics = ["text_changed"])]
pub struct EvtTextChanged {
    #[topic]
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

fn require_owner(env: &Env, caller: &Address, namehash: &BytesN<32>) {
    let registry = ensure_initialized(env);
    let owner: Address = env.invoke_contract(
        &registry,
        &Symbol::new(env, "owner"),
        (&namehash.clone(),).into_val(env),
    );
    if owner != *caller {
        panic_with_error!(env, ResolverError::NotOwner);
    }
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

    pub fn addr(env: Env, namehash: BytesN<32>) -> Option<Address> {
        ensure_initialized(&env);
        let storage = env.storage().persistent();
        let key = addr_storage_key(&env, &namehash);
        storage.get(&key)
    }

    pub fn text(env: Env, namehash: BytesN<32>, key: Bytes) -> Option<Bytes> {
        ensure_initialized(&env);
        validate_text_key(&env, &key);
        let storage = env.storage().persistent();
        let data_key = text_storage_key(&env, &namehash, &key);
        storage.get(&data_key)
    }

    pub fn set_addr(env: Env, caller: Address, namehash: BytesN<32>, addr: Address) {
        caller.require_auth();
        require_owner(&env, &caller, &namehash);

        let storage = env.storage().persistent();
        let key = addr_storage_key(&env, &namehash);
        storage.set(&key, &addr);

        EvtAddressChanged { namehash, addr }.publish(&env);
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
