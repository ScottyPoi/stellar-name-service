#![no_std]

#[cfg(test)]
extern crate std;

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

    pub fn set_text(env: Env, caller: Address, namehash: BytesN<32>, key: Bytes, value: Bytes) {
        caller.require_auth();
        validate_text_key(&env, &key);
        require_owner(&env, &caller, &namehash);

        let storage = env.storage().persistent();
        let data_key = text_storage_key(&env, &namehash, &key);
        storage.set(&data_key, &value);

        EvtTextChanged { namehash, key }.publish(&env);
    }

    pub fn registry(env: Env) -> Address {
        ensure_initialized(&env)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::{
        contract, contractimpl, contracttype,
        testutils::{Address as _, Events},
        Address, Bytes, BytesN, Env, Map, Symbol, TryFromVal,
    };
    use std::panic::{catch_unwind, AssertUnwindSafe};

    #[contract]
    pub struct MockRegistry;

    #[derive(Clone)]
    #[contracttype]
    enum MockRegistryKey {
        Owner(BytesN<32>),
    }

    #[contractimpl]
    impl MockRegistry {
        pub fn owner(env: Env, namehash: BytesN<32>) -> Address {
            env.storage()
                .persistent()
                .get(&MockRegistryKey::Owner(namehash))
                .unwrap_or_else(|| panic!("mock registry owner not set"))
        }

        pub fn set_owner(env: Env, namehash: BytesN<32>, owner: Address) {
            env.storage()
                .persistent()
                .set(&MockRegistryKey::Owner(namehash), &owner);
        }
    }

    fn namehash(env: &Env, byte: u8) -> BytesN<32> {
        BytesN::from_array(env, &[byte; 32])
    }

    fn bytes(env: &Env, data: &[u8]) -> Bytes {
        Bytes::from_slice(env, data)
    }

    #[test]
    fn it_compiles_and_returns_version() {
        let e = Env::default();
        let resolver_id = e.register(Resolver, ());
        let client = ResolverClient::new(&e, &resolver_id);
        assert_eq!(client.version(), 1);
    }

    #[test]
    fn init_once() {
        let e = Env::default();
        e.mock_all_auths();
        let resolver_id = e.register(Resolver, ());
        let registry_id = e.register(MockRegistry, ());
        let resolver = ResolverClient::new(&e, &resolver_id);

        resolver.init(&registry_id);
        assert_eq!(resolver.registry(), registry_id.clone());

        let second_call = catch_unwind(AssertUnwindSafe(|| resolver.init(&registry_id)));
        assert!(second_call.is_err());
        assert_eq!(resolver.registry(), registry_id);
    }

    #[test]
    fn unset_reads_return_none() {
        let e = Env::default();
        e.mock_all_auths();
        let resolver_id = e.register(Resolver, ());
        let registry_id = e.register(MockRegistry, ());
        let resolver = ResolverClient::new(&e, &resolver_id);

        resolver.init(&registry_id);

        let namehash = namehash(&e, 1);
        let key = bytes(&e, b"profile");

        assert!(resolver.addr(&namehash).is_none());
        assert!(resolver.text(&namehash, &key).is_none());
    }
    #[test]
    fn set_addr_happy_path() {
        let e = Env::default();
        e.mock_all_auths();
        let resolver_id = e.register(Resolver, ());
        let registry_id = e.register(MockRegistry, ());
        let resolver = ResolverClient::new(&e, &resolver_id);
        let registry = MockRegistryClient::new(&e, &registry_id);

        let namehash = namehash(&e, 2);
        let owner = Address::generate(&e);
        let addr = Address::generate(&e);
        registry.set_owner(&namehash, &owner);

        resolver.init(&registry_id);
        resolver.set_addr(&owner, &namehash, &addr);

        let events = e.events().all();
        assert_eq!(resolver.addr(&namehash), Some(addr.clone()));
        assert_eq!(events.len(), 1, "expected address event");
        let (event_contract, topics, data) = events.get(0).unwrap();
        assert_eq!(event_contract, resolver_id);

        let topic_symbol =
            Symbol::try_from_val(&e, &topics.get(0).expect("topic symbol missing")).unwrap();
        assert_eq!(topic_symbol, Symbol::new(&e, "address_changed"));

        let topic_namehash =
            BytesN::<32>::try_from_val(&e, &topics.get(1).expect("topic namehash missing"))
                .unwrap();
        assert_eq!(topic_namehash, namehash);

        let data_map =
            Map::<Symbol, Address>::try_from_val(&e, &data).expect("unable to decode event data");
        let recorded_addr = data_map
            .get(Symbol::new(&e, "addr"))
            .expect("addr missing in event");
        assert_eq!(recorded_addr, addr);
    }

    #[test]
    fn set_addr_rejects_non_owner() {
        let e = Env::default();
        e.mock_all_auths();
        let resolver_id = e.register(Resolver, ());
        let registry_id = e.register(MockRegistry, ());
        let resolver = ResolverClient::new(&e, &resolver_id);
        let registry = MockRegistryClient::new(&e, &registry_id);

        resolver.init(&registry_id);

        let namehash = namehash(&e, 3);
        let owner = Address::generate(&e);
        let stranger = Address::generate(&e);
        let addr = Address::generate(&e);

        registry.set_owner(&namehash, &owner);

        let attempt = catch_unwind(AssertUnwindSafe(|| {
            resolver.set_addr(&stranger, &namehash, &addr)
        }));
        assert!(attempt.is_err());
        assert!(resolver.addr(&namehash).is_none());
    }
}
